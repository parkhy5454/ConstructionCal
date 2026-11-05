// 간이 레이트리밋 (메모리 기반). Vercel 서버리스는 함수 인스턴스가 수시로 재생성되므로
// 완벽한 차단은 아니지만, 단순 자동화 공격에 대한 1차 방어선 역할은 합니다.
// 운영 규모가 커지면 Upstash Redis 기반 레이트리밋으로 교체하는 것을 권장합니다.
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

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
