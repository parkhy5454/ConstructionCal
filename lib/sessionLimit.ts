// 계정당 동시 로그인 1대 제한(구독 계정 공유 억제).
//
// - 로그인 성공 시 새 sid를 만들어 active_sessions에 덮어쓰고 토큰에 담습니다 → 이전 기기의 토큰은 sid가 달라 무효가 됩니다.
// - 배포 안전성: active_sessions 테이블이 아직 없으면(마이그레이션 전) 제한 없이 동작합니다(sid 없는 토큰 발급, 검사 통과).
// - SINGLE_SESSION=false 로 끌 수 있습니다.
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { activeSessions } from "./schema";
import { isMissingTable } from "./security";

type Db = ReturnType<typeof getDb>;

export function singleSessionEnabled(): boolean {
  return process.env.SINGLE_SESSION !== "false";
}

// 새 세션 ID를 발급하고 "현재 유효한 세션"으로 등록합니다. replaced=true면 다른 기기의 기존 로그인이 끊긴 것입니다.
export async function issueSid(userId: number, db: Db = getDb()): Promise<{ sid?: string; replaced: boolean }> {
  if (!singleSessionEnabled()) return { replaced: false };
  const sid = crypto.randomBytes(16).toString("hex");
  try {
    const prev = await db.select().from(activeSessions).where(eq(activeSessions.userId, userId)).limit(1);
    await db
      .insert(activeSessions)
      .values({ userId, sid })
      .onConflictDoUpdate({ target: activeSessions.userId, set: { sid, updatedAt: new Date() } });
    return { sid, replaced: prev.length > 0 };
  } catch (e) {
    if (isMissingTable(e)) return { replaced: false };
    throw e;
  }
}

// 이 토큰의 sid가 현재 유효한 세션인가. 행이 있으면 sid가 같아야 하고, 행이 없으면 sid 없는(기능 도입 전) 토큰만 허용합니다.
export async function sidIsCurrent(userId: number, sid: string | undefined, db: Db = getDb()): Promise<boolean> {
  if (!singleSessionEnabled()) return true;
  try {
    const rows = await db.select().from(activeSessions).where(eq(activeSessions.userId, userId)).limit(1);
    if (rows.length === 0) return sid === undefined;
    return rows[0].sid === sid;
  } catch (e) {
    if (isMissingTable(e)) return true;
    throw e;
  }
}

// 로그아웃: 내 세션이 현재 세션일 때만 등록을 지웁니다(다음 로그인에서 "다른 기기 로그아웃" 안내가 잘못 뜨지 않게).
export async function releaseSid(userId: number, sid: string | undefined, db: Db = getDb()): Promise<void> {
  if (!sid) return;
  try {
    await db.delete(activeSessions).where(and(eq(activeSessions.userId, userId), eq(activeSessions.sid, sid)));
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
}
