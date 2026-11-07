import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/schema";
import {
  computeAll, surchargePercentFor, DEFAULT_MATERIALS_TELECOM, DEFAULT_LABOR_RATES_BY_DISCIPLINE, DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE,
  DEFAULT_BOM_BY_DISCIPLINE, DEFAULT_RATE_SETTINGS, type Material, type Pumsem, type BomItem, type Surcharge,
} from "../lib/calc";
import { buildSnapshot, diffSnapshots, parseSnapshot } from "../lib/versions";
import { parseSurcharges, getMeta, saveMeta, getMetaMap, MetaTableMissingError } from "../lib/projectMeta";
import { createShareLink, resolveShare, revokeShareLink, listShareLinks, hashToken, validTokenShape, ShareTableMissingError } from "../lib/share";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

async function main() {
  // ---------- 1) 할증 계산 ----------
  ok(surchargePercentFor("A", undefined) === 0 && surchargePercentFor("A", []) === 0, "할증 없으면 0%");
  const S: Surcharge[] = [
    { id: "1", label: "고소", percent: 10, group: null },
    { id: "2", label: "야간", percent: 30, group: "B" },
    { id: "3", label: "감산", percent: -150, group: "C" },
  ];
  ok(surchargePercentFor("A", S) === 10, "전체 공종 할증만 적용 (A=10%)");
  ok(surchargePercentFor("B", S) === 40, "전체+공종별 합산 (B=40%)");
  ok(surchargePercentFor("C", S) === -100, "노무비가 음수가 되지 않도록 -100%로 제한");

  // 통신 예시 견적으로 실제 계산 검증
  const mats: Material[] = DEFAULT_MATERIALS_TELECOM.map((m, i) => ({ ...m, id: i + 1 }));
  const idByKey = new Map(mats.map((m) => [`${m.name}|${m.spec}`, m.id]));
  const labor = DEFAULT_LABOR_RATES_BY_DISCIPLINE.telecom!;
  const pum: Pumsem[] = [];
  for (const p of DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE.telecom!) {
    const id = idByKey.get(`${p.name}|${p.spec}`);
    if (id) pum.push({ materialId: id, laborCode: p.laborCode, factor: p.factor });
  }
  const bom: BomItem[] = DEFAULT_BOM_BY_DISCIPLINE.telecom!.flatMap((b, i) => {
    const id = idByKey.get(`${b.name}|${b.spec}`);
    return id ? [{ id: i + 1, groupName: b.g, materialId: id, qty: b.qty }] : [];
  });
  const base = computeAll(mats, pum, labor, DEFAULT_RATE_SETTINGS, bom);
  const g0 = base.groupResults[0].g;
  const withS = computeAll(mats, pum, labor, DEFAULT_RATE_SETTINGS, bom, [{ id: "x", label: "고소", percent: 20, group: null }]);
  ok(base.groupResults.every((g) => g.laborSurcharge === 0), "할증 없으면 laborSurcharge=0");
  ok(near(withS.sumLabor, base.sumLabor * 1.2), `전체 20% 할증 → 직접노무비 ×1.2 (${Math.round(base.sumLabor)} → ${Math.round(withS.sumLabor)})`);
  ok(withS.groupResults.every((g, i) => near(g.laborSurcharge, base.groupResults[i].laborAmt * 0.2)), "공종별 할증액 = 기본 노무비 × 20%");
  ok(withS.final > base.final, "할증하면 최종 금액이 늘어남");
  ok(near(withS.sumMat, base.sumMat), "재료비는 할증의 영향을 받지 않음");
  const only = computeAll(mats, pum, labor, DEFAULT_RATE_SETTINGS, bom, [{ id: "y", label: "야간", percent: 50, group: g0 }]);
  ok(near(only.groupResults[0].laborSurcharge, base.groupResults[0].laborAmt * 0.5) && only.groupResults.slice(1).every((g) => g.laborSurcharge === 0), "특정 공종에만 적용하면 그 공종만 변함");
  ok(near(withS.groupResults[0].toolLoss, (base.groupResults[0].laborAmt * 1.2) * DEFAULT_RATE_SETTINGS.toolLoss), "공구손료는 할증 포함 노무비 기준");

  // ---------- 2) 할증 입력 검증 ----------
  ok(parseSurcharges([{ label: "a", percent: 10 }]).ok === true, "정상 할증 입력 통과");
  ok(parseSurcharges([{ label: "", percent: 10 }]).ok === false, "이름 없는 할증 거부");
  ok(parseSurcharges([{ label: "a", percent: 999 }]).ok === false, "범위 밖 비율 거부");
  ok(parseSurcharges([{ label: "a", percent: "abc" }]).ok === false, "숫자 아닌 비율 거부");
  ok(parseSurcharges(Array.from({ length: 11 }, () => ({ label: "a", percent: 1 }))).ok === false, "11개 이상 거부");
  ok(parseSurcharges("x").ok === false, "배열 아닌 입력 거부");

  // ---------- 3) 버전 스냅샷/비교 ----------
  const snapA = buildSnapshot(bom, mats, [], base);
  ok(snapA.items.length === bom.length && snapA.totals.final === base.final, "스냅샷에 품목과 합계 저장");
  ok(parseSnapshot(JSON.stringify(snapA))?.items.length === bom.length, "스냅샷 직렬화 왕복");
  ok(parseSnapshot("not json") === null && parseSnapshot('{"v":2}') === null, "손상된/다른 버전 스냅샷은 null");
  const bom2 = bom.map((b, i) => (i === 0 ? { ...b, qty: b.qty + 5 } : b)).slice(0, -1);
  const extra = mats[0];
  bom2.push({ id: 999, groupName: "9.추가공종", materialId: extra.id, qty: 3 });
  const snapB = buildSnapshot(bom2, mats, [], computeAll(mats, pum, labor, DEFAULT_RATE_SETTINGS, bom2));
  const d = diffSnapshots(snapA, snapB);
  ok(d.summary.changed === 1, `수량 변경 1건 감지 (${d.summary.changed})`);
  ok(d.summary.removed === 1 && d.summary.added === 1, `삭제 1건·추가 1건 감지 (${d.summary.removed}/${d.summary.added})`);
  ok(d.summary.same === bom.length - 2, "나머지는 동일로 분류");
  ok(diffSnapshots(snapA, snapA).rows.every((r) => r.status === "same"), "같은 스냅샷끼리는 전부 동일");

  // ---------- 4) 실제 SQL: project_meta / 공유 링크 ----------
  const pg = new PGlite();
  const db: any = drizzle(pg, { schema });
  // 0007 이전 마이그레이션(기존 테이블)을 먼저 적용: 새 테이블이 아직 없는 "배포 직후" 상태를 재현
  for (const f of fs.readdirSync("drizzle").filter((n) => /^000[0-6]_.*\.sql$/.test(n)).sort()) {
    for (const stmt of fs.readFileSync(`drizzle/${f}`, "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
  }
  ok((await getMeta(1, db)).status === "draft", "테이블이 없으면 기본 메타(작성 중)");
  let threw = false;
  try { await saveMeta(1, { status: "won" }, db); } catch (e) { threw = e instanceof MetaTableMissingError; }
  ok(threw, "테이블이 없을 때 저장하면 안내 오류");
  threw = false;
  try { await createShareLink(1, 1, 7, db); } catch (e) { threw = e instanceof ShareTableMissingError; }
  ok(threw, "공유 테이블이 없을 때 생성하면 안내 오류");
  ok((await resolveShare("A".repeat(32), db)) === null, "공유 테이블이 없으면 링크는 열리지 않음(오류 없이 null)");

  const sql = fs.readFileSync("drizzle/0007_adorable_iron_fist.sql", "utf8");
  await pg.exec(sql.replace(/--> statement-breakpoint/g, ""));
  await pg.exec("insert into users (name,email,password_hash,role,status,referral_code) values ('홍길동','a@b.com','x','user','approved','AAAAAAAA'),('정지','c@d.com','x','user','rejected','BBBBBBBB')");
  await pg.exec("insert into projects (user_id,discipline,name) values (1,'electrical','P1'),(2,'electrical','P2')");

  await saveMeta(1, { status: "submitted", surcharges: [{ id: "s", label: "고소", percent: 12.5, group: null }], memo: "메모" }, db);
  const m = await getMeta(1, db);
  ok(m.status === "submitted" && m.surcharges[0].percent === 12.5 && m.memo === "메모", "메타 저장·조회 왕복");
  await saveMeta(1, { status: "won" }, db);
  const m2 = await getMeta(1, db);
  ok(m2.status === "won" && m2.surcharges.length === 1, "일부 항목만 바꿔도 나머지는 유지");
  ok((await getMetaMap([1, 2], db)).size === 1, "여러 견적서 메타 한 번에 조회");

  const L = await createShareLink(1, 1, 7, db);
  ok(validTokenShape(L.token) && L.token.length === 32, "토큰은 32자 URL-safe 문자열");
  const stored = await pg.query<{ token_hash: string }>("select token_hash from share_links");
  ok(stored.rows.length === 1 && stored.rows[0].token_hash === hashToken(L.token) && !JSON.stringify(stored.rows).includes(L.token), "DB에는 토큰 해시만 저장(원문 없음)");
  const r1 = await resolveShare(L.token, db);
  ok(!!r1 && r1.project.id === 1 && r1.ownerName === "홍길동", "유효한 토큰으로 견적서 조회");
  const row = (await pg.query<{ view_count: number }>("select view_count from share_links")).rows[0];
  ok(row.view_count === 1, "조회수 증가");
  ok((await resolveShare("B".repeat(32), db)) === null, "없는 토큰은 거부");
  ok((await resolveShare("short", db)) === null && (await resolveShare("../../etc/passwd", db)) === null, "형식이 틀린 토큰은 DB 조회 없이 거부");
  ok(await revokeShareLink(1, L.id, db), "링크 해지");
  ok((await resolveShare(L.token, db)) === null, "해지된 링크는 열리지 않음");
  ok(!(await revokeShareLink(1, L.id, db)), "이미 해지된 링크를 또 해지하면 false");
  const L2 = await createShareLink(1, 1, 7, db);
  await pg.exec(`update share_links set expires_at = now() - interval '1 minute' where id = ${L2.id}`);
  ok((await resolveShare(L2.token, db)) === null, "만료된 링크는 열리지 않음");
  const L3 = await createShareLink(2, 2, 7, db);
  ok((await resolveShare(L3.token, db)) === null, "소유자가 승인 상태가 아니면 열리지 않음");
  const L4 = await createShareLink(1, 1, 500, db);
  const days = (L4.expiresAt.getTime() - Date.now()) / 86400000;
  ok(days > 89 && days < 91, "유효기간은 최대 90일로 제한");
  const wrongProject = await createShareLink(1, 2, 7, db); // 다른 사람의 프로젝트에 대한 링크 → 소유자 불일치
  ok((await resolveShare(wrongProject.token, db)) === null, "링크의 사용자와 프로젝트 소유자가 다르면 거부");
  ok((await listShareLinks(1, db)).length === 3, "견적서별 링크 목록 조회(다른 견적서 링크 제외)");

  console.log(fails ? `FAIL ${fails}` : "ALL PASS");
  process.exit(fails ? 1 : 0);
}
main();
