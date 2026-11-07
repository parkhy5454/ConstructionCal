import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { rateLimitAsync, clientIp } from "@/lib/rateLimit";
import { createToken, getSecurity, isEmailVerificationEnforced } from "@/lib/security";
import { sendMail, appBaseUrl, verificationEmail } from "@/lib/mailer";

export const runtime = "nodejs";

// 인증 메일 재발송. 가입 여부가 드러나지 않도록 항상 같은 응답을 돌려주고, 메일 폭탄(남의 주소로 반복 발송)을 막기 위해 엄격히 제한합니다.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 255);
  const generic = NextResponse.json({ ok: true, message: "가입된 이메일이고 아직 인증 전이라면 인증 메일을 다시 보냈습니다. 메일함(스팸함 포함)을 확인해주세요." });

  if (!(await rateLimitAsync(`resend:${ip}`, 10, 60 * 60_000)) || !(await rateLimitAsync(`resend-acct:${email}`, 3, 60 * 60_000))) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  if (!email || !isEmailVerificationEnforced()) return generic;

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) return generic;
  const sec = await getSecurity(user.id);
  if (!sec || sec.emailVerifiedAt) return generic; // 이미 인증됐거나 인증 대상이 아님

  try {
    const raw = await createToken(user.id, "verify_email", 24 * 60 * 60_000);
    const mail = verificationEmail(user.name, `${appBaseUrl(req)}/verify-email?token=${raw}`);
    await sendMail({ to: email, ...mail });
  } catch (e) {
    console.error("[resend-verification] 실패:", e instanceof Error ? e.message : e);
  }
  return generic;
}
