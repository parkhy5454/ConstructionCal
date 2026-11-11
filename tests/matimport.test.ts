import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/schema";
import { parseDelimited, rowsFromTable, planImport, applyImport, loadExisting } from "../lib/materialImport";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };

async function main() {
  const pg = new PGlite();
  const db: any = drizzle(pg, { schema });
  for (const f of fs.readdirSync("drizzle").filter((x) => x.endsWith(".sql")).sort()) {
    await pg.exec(fs.readFileSync(`drizzle/${f}`, "utf8").replace(/--> statement-breakpoint/g, ""));
  }

  const tsv = "page\tcategory\tname\tspec\tunit\tprice\tmaker\tflag\n90\t배선용차단기\tHGP50DS\t정격전압:460V / 극수 3P\t대\t143,800\t현대일렉트릭\t\n90\t배선용차단기\tHGP50DS\t정격전압:460V / 극수 4P3D\t대\t186400\t현대일렉트릭\t\n90\t배선용차단기\tHGP50DS\t정격전압:460V / 극수 3P\t대\t143800\t현대일렉트릭\t\n91\t배선용차단기\t없는단가\t규격\t대\t-\t\t\n";
  const parsed = rowsFromTable(parseDelimited(tsv));
  ok(parsed.rows.length === 3 && parsed.skipped === 1, "TSV 파싱: 단가 없는 행은 건너뜀, 쉼표 단가 인식");
  ok(parsed.rows[0].price === 143800 && parsed.rows[0].maker === "현대일렉트릭", "단가 숫자·제조사 읽기");

  const csv = rowsFromTable(parseDelimited('분류,품명,규격,단위,단가\n전선,"HFIX, 1.5㎟","450/750V, 1C",m,320\n'));
  ok(csv.rows.length === 1 && csv.rows[0].name === "HFIX, 1.5㎟", "CSV: 따옴표 안의 쉼표 처리");

  const none = await loadExisting(db, 1, "electrical");
  const plan = planImport(parsed.rows, none);
  ok(plan.inserts.length === 2 && plan.duplicatesInFile === 1, "같은 파일 안 중복 행 제거(2건 추가)");
  ok(plan.inserts[0].spec.endsWith("[현대일렉트릭]"), "제조사는 규격 뒤 [제조사]로 별도 자재 구분");
  const r1 = await applyImport(db, 1, "electrical", plan);
  ok(r1.inserted === 2, "일괄 추가");

  const again = planImport(rowsFromTable(parseDelimited(tsv.replace("186400", "190000"))).rows, await loadExisting(db, 1, "electrical"));
  ok(again.inserts.length === 0 && again.updates.length === 1 && again.unchanged === 1, "다시 올리면 단가 변경 1건만 갱신, 나머지는 그대로");
  await applyImport(db, 1, "electrical", again);
  const after = await loadExisting(db, 1, "electrical");
  ok(after.length === 2 && after.some((m) => m.price === 190000), "갱신 반영, 건수 유지");
  const other = await loadExisting(db, 2, "electrical");
  ok(other.length === 0, "다른 사용자 자재는 영향 없음");

  // 대량(2만 건) 성능·정합성
  const big = Array.from({ length: 20000 }, (_, i) => ({ category: "전선", name: `자재${i}`, spec: `규격${i % 97}`, unit: "m", price: 100 + i, maker: i % 3 ? "A사" : "" }));
  const t0 = Date.now();
  const bp = planImport(big, await loadExisting(db, 1, "electrical"));
  await applyImport(db, 1, "electrical", bp);
  const cnt = (await loadExisting(db, 1, "electrical")).length;
  ok(bp.inserts.length === 20000 && cnt === 20002, `2만 건 일괄 등록 (${Date.now() - t0}ms)`);
  if (fails) process.exit(1);
}
main();
