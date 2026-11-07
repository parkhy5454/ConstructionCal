// 로그인 성공 기록: 내 정보의 "최근 로그인", 새 환경 로그인 알림, 관리자의 계정 공유 의심 지표에 씁니다.
// login_events 테이블이 없으면(마이그레이션 전) 아무 것도 하지 않습니다. 기록 실패가 로그인을 막지 않도록 호출부에서 try/catch 합니다.
import { eq, desc, lt, sql, and, gt } from "drizzle-orm";
import { getDb } from "./db";
import { loginEvents } from "./schema";
import { isMissingTable } from "./security";
import { clientIp } from "./rateLimit";

type Db = ReturnType<typeof getDb>;
export const LOGIN_RETENTION_DAYS = 90;

export function describeAgent(ua: string): string {
  const os = /Windows/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "알 수 없는 기기";
  const br = /Edg\//i.test(ua) ? "Edge" : /Chrome\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) && /Version\//i.test(ua) ? "Safari" : /Firefox\//i.test(ua) ? "Firefox" : "브라우저";
  return `${os} · ${br}`;
}

export function maskIp(ip: string): string {
  if (ip.includes(".")) return ip.split(".").slice(0, 2).join(".") + ".*.*";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + ":*";
  return ip ? "비공개" : "";
}

// 이 IP+브라우저 조합이 최근 30일 안에 쓰인 적이 있는가(처음 보는 환경인지 판단)
export async function isKnownEnvironment(userId: number, ip: string, ua: string, db: Db = getDb()): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 30 * 86400_000);
    const rows = await db.select({ id: loginEvents.id }).from(loginEvents)
      .where(and(eq(loginEvents.userId, userId), eq(loginEvents.ip, ip), eq(loginEvents.userAgent, ua.slice(0, 200)), gt(loginEvents.createdAt, since))).limit(1);
    return rows.length > 0;
  } catch (e) {
    if (isMissingTable(e)) return true; // 기록 기능이 없으면 알림도 보내지 않음
    throw e;
  }
}

export async function recordLogin(userId: number, req: Request, db: Db = getDb()): Promise<{ ip: string; ua: string }> {
  const ip = clientIp(req).slice(0, 64);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  try {
    await db.insert(loginEvents).values({ userId, ip, userAgent: ua });
    if (Math.random() < 0.02) await purgeOldLogins(db); // 가끔 오래된 기록 정리(크론이 없어도 쌓이지 않게)
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  return { ip, ua };
}

export async function purgeOldLogins(db: Db = getDb()): Promise<void> {
  try {
    await db.delete(loginEvents).where(lt(loginEvents.createdAt, new Date(Date.now() - LOGIN_RETENTION_DAYS * 86400_000)));
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
}

export async function recentLogins(userId: number, n = 10, db: Db = getDb()) {
  try {
    const rows = await db.select().from(loginEvents).where(eq(loginEvents.userId, userId)).orderBy(desc(loginEvents.id)).limit(n);
    return rows.map((r) => ({ at: r.createdAt, ip: maskIp(r.ip), agent: describeAgent(r.userAgent) }));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

// 관리자용: 사용자별 마지막 로그인과 최근 7/30일 서로 다른 IP 수
export async function loginStats(db: Db = getDb()): Promise<Map<number, { lastAt: Date; ips7: number; ips30: number }>> {
  const out = new Map<number, { lastAt: Date; ips7: number; ips30: number }>();
  try {
    const res = await db.execute(sql`
      select user_id, max(created_at) as last_at,
        count(distinct ip) filter (where created_at > now() - interval '7 days') as ips7,
        count(distinct ip) filter (where created_at > now() - interval '30 days') as ips30
      from login_events group by user_id`);
    const rows = ((res as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? (res as unknown as Array<Record<string, unknown>>)) as Array<Record<string, unknown>>;
    for (const r of rows) out.set(Number(r.user_id), { lastAt: new Date(String(r.last_at)), ips7: Number(r.ips7), ips30: Number(r.ips30) });
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  return out;
}
