import { sql } from "drizzle-orm";
import { getDb } from "./db";

type Db = ReturnType<typeof getDb>;

// 메모리 기반 레이트리밋. Vercel 서버리스는 인스턴스마다 따로 세므로 완벽하지 않아,
// DB 기반 rateLimitAsync가 실패(테이블 없음/DB 장애)할 때의 대비책으로만 씁니다.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

let warned = false;

// DB(Neon)에 카운터를 두는 레이트리밋 — 모든 서버리스 인스턴스가 같은 카운터를 공유합니다.
// INSERT ... ON CONFLICT 한 문장으로 "증가+창 초기화"를 원자적으로 처리하므로 동시 요청에도 정확합니다.
// 테이블이 아직 없거나 DB 오류면 메모리 방식으로 대체하되(로그인 자체가 막히지 않게), 서버 로그에 한 번 경고를 남깁니다.
export async function rateLimitAsync(key: string, limit: number, windowMs: number, db: Db = getDb()): Promise<boolean> {
  try {
    const secs = windowMs / 1000;
    const res = await db.execute(sql`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (${key}, 1, now() + (${secs}::double precision * interval '1 second'))
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at < now()
                        THEN now() + (${secs}::double precision * interval '1 second')
                        ELSE rate_limits.reset_at END
      RETURNING count
    `);
    const count = Number((res.rows[0] as { count: number | string }).count);
    // 만료된 카운터 정리(가끔씩만, 응답을 기다리지 않음)
    if (Math.random() < 0.02) {
      void db.execute(sql`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 day'`).catch(() => {});
    }
    return count <= limit;
  } catch (e) {
    if (!warned) {
      warned = true;
      console.warn("[rateLimit] DB 레이트리밋을 쓸 수 없어 메모리 방식으로 대체합니다(마이그레이션 `npm run db:push` 필요?):", e instanceof Error ? e.message : e);
    }
    return rateLimit(key, limit, windowMs);
  }
}

export function clientIp(req: Request): string {
  // Vercel은 클라이언트가 보낸 x-forwarded-for를 덮어써서 실제 접속 IP를 앞에 넣어줍니다.
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip") ?? "unknown";
}
