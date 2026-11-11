/**
 * 표준품셈 책(jsonl)을 공용 pumsem_items 테이블에 적재합니다(업종별로 기존 내용을 교체).
 * 사용법: npx tsx scripts/load-pumsem.ts 업종 파일.jsonl [--dry]
 * jsonl 한 줄: {discipline, code, chapter, section, title, spec, unit, page, note, review[], labors[{name,factor}]}
 */
import fs from "fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../lib/schema";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const [discipline, file] = args.filter((a) => a !== "--dry");
  if (!discipline || !file) { console.error("사용법: npx tsx scripts/load-pumsem.ts 업종 파일.jsonl [--dry]"); process.exit(1); }
  const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const vals = rows.map((r) => ({
    discipline: discipline as never,
    code: String(r.code ?? "").slice(0, 40),
    chapter: String(r.chapter ?? "").slice(0, 160),
    section: String(r.section ?? "").slice(0, 200),
    title: String(r.title ?? "").slice(0, 300) || "(제목 없음)",
    spec: String(r.spec ?? "").slice(0, 500),
    unit: String(r.unit ?? "").slice(0, 40),
    page: Number.isInteger(r.page) ? r.page : null,
    note: String(r.note ?? ""),
    review: Array.isArray(r.review) ? r.review.join("; ") : String(r.review ?? ""),
    labors: JSON.stringify(r.labors ?? []),
  }));
  console.log(`${discipline}: ${vals.length.toLocaleString()}건 (검토 필요 ${vals.filter((v) => v.review).length})`);
  if (dry) { console.log("(--dry)"); return; }
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL이 없습니다."); process.exit(1); }
  const db = drizzle(neon(url), { schema });
  await db.delete(schema.pumsemItems).where(eq(schema.pumsemItems.discipline, discipline as never));
  for (let i = 0; i < vals.length; i += 500) {
    await db.insert(schema.pumsemItems).values(vals.slice(i, i + 500));
    process.stdout.write(`\r${Math.min(i + 500, vals.length)} / ${vals.length}`);
  }
  console.log("\n완료");
}
main().catch((e) => { console.error(e); process.exit(1); });
