import { NextRequest, NextResponse } from "next/server";
import { rateLimitAsync, clientIp } from "@/lib/rateLimit";
import { reportError } from "@/lib/monitor";

export const runtime = "nodejs";

// 브라우저에서 난 화면 오류를 받아 알림으로 넘깁니다. 로그인 전에도 오류가 날 수 있어 인증은 요구하지 않고, IP당 호출 수를 제한합니다.
export async function POST(req: NextRequest) {
  if (!(await rateLimitAsync(`clienterr:${clientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ ok: true }); // 조용히 무시
  }
  const raw = await req.text().catch(() => "");
  if (raw.length > 8000) return NextResponse.json({ ok: true });
  let body: { message?: unknown; stack?: unknown; path?: unknown } = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }
  const path = String(body.path ?? "").slice(0, 200).replace(/[?#].*$/, ""); // 쿼리스트링(토큰 등) 제거
  await reportError("client", Object.assign(new Error(String(body.message ?? "").slice(0, 300)), { stack: String(body.stack ?? "").slice(0, 1500) }), { path });
  return NextResponse.json({ ok: true });
}
