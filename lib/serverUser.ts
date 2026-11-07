import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "./schema";
import { verifySession, sessionMatchesPassword, SESSION_COOKIE } from "./auth";

// 서버 컴포넌트(페이지)에서 쓰는 버전. API 라우트는 lib/currentUser.ts(NextRequest 기반)를 씁니다.
export async function getServerUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, payload.uid)).limit(1);
  if (rows.length === 0) return null;
  const user = rows[0];
  if (user.status !== "approved") return null;
  if (!sessionMatchesPassword(payload, user.passwordHash)) return null;
  return user;
}
