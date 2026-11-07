import { issueSid } from "@/lib/sessionLimit";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import {
  verifyPassword,
  signSession,
  signTwoFactorChallenge,
  passwordFingerprint,
  sessionCookieOptions,
  DUMMY_PASSWORD_HASH,
  SESSION_COOKIE,
} from "@/lib/auth";
import { rateLimitAsync, clientIp } from "@/lib/rateLimit";
import { getSecurity, isEmailVerificationEnforced } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 255);
  const password = String(body.password ?? "").slice(0, 200);

  // 세 겹 제한: (IP+이메일) 집중 시도, (이메일) 여러 IP로 분산된 시도, (IP) 여러 계정을 돌려가며 찍는 크리덴셜 스터핑
  const tooMany =
    !(await rateLimitAsync(`login:${ip}:${email}`, 8, 10 * 60_000)) ||
    !(await rateLimitAsync(`login-acct:${email}`, 20, 15 * 60_000)) ||
    !(await rateLimitAsync(`login-ip:${ip}`, 40, 10 * 60_000));
  if (tooMany) {
    return NextResponse.json({ error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const genericError = () => NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });

  if (rows.length === 0) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH); // 응답 시간으로 가입 여부가 드러나지 않게
    return genericError();
  }
  const user = rows[0];

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return genericError();

  if (user.status === "pending") {
    return NextResponse.json({ error: "관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다." }, { status: 403 });
  }
  if (user.status === "rejected") {
    return NextResponse.json({ error: "가입이 승인되지 않았습니다. 관리자에게 문의하세요." }, { status: 403 });
  }

  // 비밀번호까지 맞은 사용자에게만 보안 상태를 확인합니다(그 전에는 아무 정보도 노출하지 않음).
  const security = await getSecurity(user.id);

  if (isEmailVerificationEnforced() && security && !security.emailVerifiedAt) {
    return NextResponse.json(
      { error: "이메일 인증이 필요합니다. 가입 시 받은 인증 메일의 링크를 눌러주세요.", needsEmailVerification: true },
      { status: 403 }
    );
  }

  // 2단계 인증이 켜진 계정: 세션을 발급하지 않고 코드 입력 단계로 넘깁니다.
  if (security?.totpEnabled === 1) {
    return NextResponse.json({ needs2fa: true, challenge: signTwoFactorChallenge(user.id) });
  }

  const { sid, replaced } = await issueSid(user.id);
  const token = signSession({ uid: user.id, role: user.role, status: user.status, pv: passwordFingerprint(user.passwordHash), sid });
  const res = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword === 1,
    },
    replacedOtherSession: replaced,
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
