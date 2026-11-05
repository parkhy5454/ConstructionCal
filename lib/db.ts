import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// 지연 초기화: 빌드 타임에 DATABASE_URL이 없어도 번들링이 깨지지 않도록 함.
// 실제 요청 처리 시(런타임)에만 연결을 맺습니다.
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL이 설정되지 않았습니다. Vercel 프로젝트 설정 > Environment Variables 에서 Neon 연결 문자열을 추가하세요."
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}
