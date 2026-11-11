/**
 * 자재 단가 표(TSV/CSV)를 사용자 계정의 자재 DB에 대량 등록하는 스크립트입니다(웹 업로드 4MB 제한 없음).
 * 같은 품명·규격·단위는 단가만 갱신하고, 없으면 새로 추가합니다. 먼저 --dry 로 건수만 확인할 수 있습니다.
 *
 * 사용법 (프로젝트 루트, .env.local에 DATABASE_URL 설정):
 *   npx tsx scripts/load-materials.ts 이메일 업종 파일1.tsv [파일2.tsv ...] [--dry]
 *   업종: electrical | telecom | fire | mechanical | civil | architecture
 */
import fs from "fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../lib/schema";
import { parseDelimited, rowsFromTable, planImport, applyImport, loadExisting, type ImportRow } from "../lib/materialImport";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const [email, discipline, ...files] = args.filter((a) => a !== "--dry");
  if (!email || !discipline || files.length === 0) { console.error("사용법: npx tsx scripts/load-materials.ts 이메일 업종 파일.tsv [...] [--dry]"); process.exit(1); }
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL 환경변수가 없습니다. .env.local을 확인하세요."); process.exit(1); }
  const db = drizzle(neon(url), { schema });
  const user = (await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1))[0];
  if (!user) { console.error(`계정을 찾을 수 없습니다: ${email}`); process.exit(1); }

  const all: ImportRow[] = [];
  for (const f of files) {
    const r = rowsFromTable(parseDelimited(fs.readFileSync(f, "utf8")));
    console.log(`${f}: ${r.rows.length.toLocaleString()}행 (제외 ${r.skipped})`);
    all.push(...r.rows);
  }
  const plan = planImport(all, await loadExisting(db, user.id, discipline));
  console.log(`새로 추가 ${plan.inserts.length.toLocaleString()} · 단가 변경 ${plan.updates.length.toLocaleString()} · 변경 없음 ${plan.unchanged.toLocaleString()} · 파일 안 중복 ${plan.duplicatesInFile.toLocaleString()}`);
  if (dry) { console.log("(--dry: DB에는 쓰지 않았습니다)"); return; }
  const out = await applyImport(db, user.id, discipline, plan, (d, t) => process.stdout.write(`\r${d.toLocaleString()} / ${t.toLocaleString()}`));
  console.log(`\n완료: 추가 ${out.inserted.toLocaleString()}, 변경 ${out.updated.toLocaleString()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
