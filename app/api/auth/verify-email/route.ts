import { NextRequest, NextResponse } from "next/server";
import { rateLimitAsync, clientIp } from "@/lib/rateLimit";
import { consumeToken, markEmailVerified } from "@/lib/security";

export const runtime = "nodejs";

// 메일 링크(/verify-email?token=...)가 열릴 때 화면이 호출합니다.
// GET이 아니라 POST인 이유: 메일 보안 프로그램이 링크를 미리 열어보다가 1회용 토큰을 소진해 버리는 일을 막기 위해서입니다.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await rateLimitAsync(`verify-email:${ip}`, 20, 10 * 60_000))) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "");
  const userId = await consumeToken("verify_email", token);
  if (userId == null) {
    return NextResponse.json({ error: "링크가 만료되었거나 이미 사용되었습니다. 로그인 화면에서 인증 메일을 다시 받아주세요." }, { status: 400 });
  }
  await markEmailVerified(userId);
  return NextResponse.json({ ok: true });
}
