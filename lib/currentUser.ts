import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "./schema";
import { verifySession, SESSION_COOKIE } from "./auth";

// 토큰의 role/status는 발급 시점 스냅샷이므로(최대 7일), 민감한 작업 전에는
// 항상 DB에서 현재 상태를 다시 조회해 "승인취소/권한변경 이후에도 옛 토큰으로 접근" 되는 상황을 막습니다.
export async function getCurrentUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, payload.uid)).limit(1);
  if (rows.length === 0) return null;
  const user = rows[0];
  if (user.status !== "approved") return null; // 승인취소된 경우 즉시 차단
  return user;
}

export async function requireAdmin(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") return null;
  return user;
}
