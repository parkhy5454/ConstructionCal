/**
 * 최초 관리자 계정을 만드는 1회성 스크립트입니다.
 * 회원가입 API는 모든 신규 계정을 role=user, status=pending 으로만 만들기 때문에
 * (관리자가 없으면 아무도 승인할 수 없는 "닭과 달걀" 문제), 최초 관리자만큼은
 * 이 스크립트로 로컬에서 직접 DB에 넣습니다.
 *
 * 사용법 (프로젝트 루트에서, .env.local에 DATABASE_URL이 설정된 상태로):
 *   npx tsx scripts/create-admin.ts "관리자이름" admin@example.com "비밀번호123"
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../lib/schema";

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('사용법: npx tsx scripts/create-admin.ts "이름" 이메일 비밀번호');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("비밀번호는 8자 이상이어야 합니다.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL 환경변수가 없습니다. .env.local을 확인하세요.");
    process.exit(1);
  }

  const sql = neon(url);
  const db = drizzle(sql, { schema });

  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) {
    console.error("이미 존재하는 이메일입니다:", email);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const referralCode = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  await db.insert(schema.users).values({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: "admin",
    status: "approved",
    referralCode,
  });

  console.log("✅ 관리자 계정이 생성되었습니다:", email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
