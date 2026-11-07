import { issueSid } from "@/lib/sessionLimit";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { verifyTwoFactorChallenge, signSession, passwordFingerprint, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { rateLimitAsync, clientIp } from "@/lib/rateLimit";
import { verifySecondFactor } from "@/lib/twoFactor";

export const runtime = "nodejs";

// 로그인 2단계: 비밀번호 단계에서 받은 challenge + 인증 앱 코드(또는 복구 코드)를 확인하고 세션을 발급합니다.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const uid = verifyTwoFactorChallenge(String(body.challenge ?? ""));
  if (uid == null) {
    return NextResponse.json({ error: "인증 단계가 만료되었습니다. 처음부터 다시 로그인해주세요.", expired: true }, { status: 401 });
  }

  // 6자리 코드는 100만 가지뿐이므로 계정 단위로 시도 횟수를 엄격히 제한합니다.
  const tooMany =
    !(await rateLimitAsync(`2fa:${uid}`, 8, 10 * 60_000)) || !(await rateLimitAsync(`2fa-ip:${ip}`, 30, 10 * 60_000));
  if (tooMany) {
    return NextResponse.json({ error: "시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  const user = rows[0];
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "로그인할 수 없는 계정입니다." }, { status: 403 });
  }

  const ok = await verifySecondFactor(user.id, String(body.code ?? "").slice(0, 40));
  if (!ok) return NextResponse.json({ error: "인증 코드가 올바르지 않습니다." }, { status: 401 });

  const { sid, replaced } = await issueSid(user.id);
  const token = signSession({ uid: user.id, role: user.role, status: user.status, pv: passwordFingerprint(user.passwordHash), sid });
  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword === 1 },
    replacedOtherSession: replaced,
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
