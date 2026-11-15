import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/schema";
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
  if (fails) process.exit(1);
}
main();
