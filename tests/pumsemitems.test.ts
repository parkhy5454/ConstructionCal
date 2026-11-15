import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/schema";
import { suggestPumsem, nameTokens, scoreItem } from "../lib/pumsemSuggest";
import { removeSampleMaterials, deleteMaterialsByIds } from "../lib/estimateData";
import { searchPriceItems, importPriceRows, adoptPriceItem } from "../lib/priceItems";
import { searchPumsemItems, applyPumsemItem, parseLabors, importPumsemRows, toPumsemRow } from "../lib/pumsemItems";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };

async function main() {
  const pg = new PGlite();
  const db: any = drizzle(pg, { schema });
  for (const f of fs.readdirSync("drizzle").filter((x) => x.endsWith(".sql")).sort()) {
    await pg.exec(fs.readFileSync(`drizzle/${f}`, "utf8").replace(/--> statement-breakpoint/g, ""));
  }
  await db.insert(schema.pumsemItems).values([
    { discipline: "electrical", chapter: "제8장 배관", section: "전선관", title: "후강전선관 배관", spec: "28mm", unit: "m", labors: JSON.stringify([{ name: "내선전공", factor: 0.1 }, { name: "보통인부", factor: 0.03 }]) },
    { discipline: "electrical", chapter: "제8장 배관", section: "전선관", title: "후강전선관 배관", spec: "36mm", unit: "m", labors: "[]" },
    { discipline: "fire", chapter: "x", section: "", title: "스프링클러", spec: "", unit: "개", labors: "not json" },
  ]);
  const r = await searchPumsemItems("electrical", "후강 28", 10, 0, db);
  ok(r.total === 1 && r.rows[0].labors.length === 2, "품셈 책 검색: 단어 모두 일치, 업종 분리");
  ok((await searchPumsemItems("electrical", "내선전공", 10, 0, db)).total === 1, "직종 이름(내선전공)으로도 검색");
  ok((await searchPumsemItems("electrical", "보통인부 후강", 10, 0, db)).total === 1, "직종 + 공종 이름을 함께 검색");
  ok((await searchPumsemItems("electrical", "", 10, 0, db)).total === 2, "빈 검색은 업종 전체");
  ok(parseLabors("not json").length === 0, "깨진 labors JSON은 빈 목록");

  const [m] = await db.insert(schema.materials).values({ userId: 1, discipline: "electrical", category: "배관", name: "후강전선관", spec: "28mm", unit: "m", price: "1000" }).returning();
  await db.insert(schema.laborRates).values({ userId: 1, discipline: "electrical", code: "L01", name: "내선전공", rate: "200000" });
  const a = await applyPumsemItem(1, "electrical", m.id, r.rows[0], true, db);
  ok(a.applied.length === 2 && a.createdLabor.join() === "보통인부", "적용: 기존 직종 매핑, 없는 직종은 새로 생성");
  const lr = await db.select().from(schema.laborRates);
  ok(lr.length === 2 && lr.some((x: any) => x.name === "보통인부" && Number(x.rate) === 0), "새 직종은 노임 0원");
  const b = await applyPumsemItem(1, "electrical", m.id, { ...r.rows[0], labors: [{ name: "내선전공", factor: 0.2 }] }, true, db);
  const pm = await db.select().from(schema.pumsem);
  ok(pm.length === 1 && Number(pm[0].factor) === 0.2 && b.createdLabor.length === 0, "다시 적용하면 기존 공수를 대체");
  const imp = await importPumsemRows("telecom", [
    { code: "1", title: "케이블 포설", spec: "UTP", unit: "m", page: 3, review: ["단위 승계"], labors: [{ name: "통신케이블공", factor: 0.05 }] },
    { code: "2", title: "공수 없음", labors: [] },
  ], true, db);
  ok(imp.inserted === 1 && imp.skipped === 1, "관리자 적재: 공수 없는 줄은 건너뜀");
  await importPumsemRows("telecom", [{ code: "9", title: "교체", labors: [{ name: "보통인부", factor: 1 }] }], true, db);
  const tel = await searchPumsemItems("telecom", "", 10, 0, db);
  ok(tel.total === 1 && tel.rows[0].code === "9", "첫 묶음은 그 업종 기존 항목을 교체");
  ok((await searchPumsemItems("electrical", "", 10, 0, db)).total === 2, "다른 업종은 영향 없음");
  ok(toPumsemRow("fire", { title: "x", labors: [{ name: "a", factor: -1 }] }) === null, "음수 공수는 무시");
  ok(nameTokens("강제전선관(노출) 아연도").join() === "강제전선관,노출,아연도", "품명 낱말 분리");
  ok(scoreItem(["전선관"], ["28"], { chapter: "", section: "", title: "후강전선관 배관", spec: "28mm" }) === 5, "이름 3점 + 규격 숫자 2점");
  ok(scoreItem(["전선관"], ["28"], { chapter: "", section: "", title: "케이블", spec: "28" }) === 0, "이름이 안 맞으면 0점");
  const sg2 = await suggestPumsem("electrical", "강제전선관(노출) 아연도", "28 mm", 3, db);
  ok(sg2.length >= 1 && sg2[0].item.title.includes("후강전선관") && sg2[0].item.spec === "28mm", "별칭: 강제전선관(아연도) → 후강전선관 28mm 후보");
  const sg = await suggestPumsem("electrical", "전선관", "28 mm", 3, db);
  ok(Array.isArray(sg), "추천 조회가 오류 없이 배열 반환");
  await db.insert(schema.materials).values([
    { userId: 9, discipline: "electrical", name: "노출박스", spec: "16mm-1방출", unit: "개", price: "2818" },
    { userId: 9, discipline: "electrical", name: "내가담은자재", spec: "x", unit: "개", price: "1" },
  ]);
  const rs = await removeSampleMaterials(9, "electrical", db);
  const left = await db.select().from(schema.materials).where(require("drizzle-orm").eq(schema.materials.userId, 9));
  ok(rs.deleted === 1 && left.length === 1 && left[0].name === "내가담은자재", "예시 자재만 지우고 내가 담은 자재는 남김");
  const ids9 = left.map((m: { id: number }) => m.id);
  const other = await db.insert(schema.materials).values({ userId: 10, discipline: "electrical", name: "남의자재", spec: "", unit: "개", price: "1" }).returning();
  const bd = await deleteMaterialsByIds(9, [...ids9, other[0].id], db);
  const rest10 = await db.select().from(schema.materials).where(require("drizzle-orm").eq(schema.materials.userId, 10));
  ok(bd.deleted === 1 && rest10.length === 1, "선택 삭제: 내 자재만 지우고 남의 자재는 건드리지 않음");
  const pr = await importPriceRows("electrical", "2026년 11월호", [
    { category: "부스덕트 및 부품(1)", name: "600V In Door Bus Duct", spec: "3W / 600A", unit: "m", price: "1,234,500", maker: "LS전선" },
    { category: "차단기", name: "HGP50DS", spec: "3P", unit: "대", price: 143800, maker: "" },
    { category: "x", name: "", unit: "m", price: 1 },
  ], true, db);
  ok(pr.inserted === 2 && pr.skipped === 1, "공용 단가표 적재: 쉼표 단가 처리, 품명 없는 줄 제외");
  const f1 = await searchPriceItems("electrical", "부스덕트", 10, 0, db);
  ok(f1.total === 1 && f1.rows[0].price === 1234500 && f1.rows[0].maker === "LS전선", "분류로 검색, 단가·제조사 반환");
  ok((await searchPriceItems("electrical", "bus duct 600a", 10, 0, db)).total === 1, "영문·여러 단어 모두 포함 검색");
  ok((await searchPriceItems("fire", "", 10, 0, db)).total === 0, "업종별로 분리");
  ok((await searchPriceItems("electrical", "부스덕트 & 600a, ls전선", 10, 0, db)).total === 1, "& 와 쉼표는 검색어에서 무시");
  const hid = (await searchPriceItems("electrical", "HGP50DS", 10, 0, db)).rows[0].id;
  const a1 = await adoptPriceItem(7, "electrical", hid, db);
  ok(!!a1 && a1.created && a1.price === 143800, "공용 단가표 → 내 자재로 담기(신규)");
  await importPriceRows("electrical", "2026년 12월호", [{ name: "HGP50DS", spec: "3P", unit: "대", price: 150000 }], false, db);
  const hid2 = (await searchPriceItems("electrical", "HGP50DS", 10, 0, db)).rows.find((r) => r.price === 150000)!.id;
  const a2 = await adoptPriceItem(7, "electrical", hid2, db);
  ok(!!a2 && !a2.created && a2.id === a1!.id && a2.price === 150000, "같은 자재는 새로 만들지 않고 단가만 갱신");
  ok((await adoptPriceItem(8, "electrical", 999999, db)) === null, "없는 항목은 null");
  await importPriceRows("electrical", "다음달", [{ name: "새자재", unit: "개", price: 5 }], true, db);
  ok((await searchPriceItems("electrical", "", 10, 0, db)).total === 1, "다시 올리면 그 업종 기준표가 교체됨");
  if (fails) process.exit(1);
}
main();
