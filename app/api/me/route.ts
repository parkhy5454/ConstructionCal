import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, adminActions } from "@/lib/schema";
import { getCurrentUser } from "@/lib/currentUser";
import {
  verifyPassword,
  hashPassword,
  validatePasswordPolicy,
  validateEmail,
  signSession,
  verifySession,
  passwordFingerprint,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth";
import { rateLimitAsync } from "@/lib/rateLimit";
import { isEmailVerificationEnforced, markEmailUnverified, createToken } from "@/lib/security";
import { sendMail, appBaseUrl, verificationEmail } from "@/lib/mailer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      mustChangePassword: user.mustChangePassword === 1,
    },
  });
}

// 본인 정보 수정: 이름/이메일 변경, 본인 비밀번호 변경(현재 비밀번호 확인 필수)
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const db = getDb();
  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  // 비밀번호가 필요한 변경(이메일 변경, 비밀번호 변경)은 세션을 훔친 사람이 계정을 가로채지 못하도록
  // 현재 비밀번호를 확인하고, 그 확인 시도 횟수도 제한합니다.
  const emailChanging = body.email !== undefined && String(body.email).trim().toLowerCase() !== user.email;
  let newEmail: string | null = null;
  if (emailChanging || body.newPassword !== undefined) {
    if (!(await rateLimitAsync(`me-pw:${user.id}`, 10, 10 * 60_000))) {
      return NextResponse.json({ error: "시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
    }
    const ok = await verifyPassword(String(body.currentPassword ?? ""), user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: emailChanging ? "이메일을 바꾸려면 현재 비밀번호를 입력해야 합니다." : "현재 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 80) return NextResponse.json({ error: "이름이 올바르지 않습니다." }, { status: 400 });
    updates.name = name;
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!validateEmail(email)) return NextResponse.json({ error: "이메일 형식이 올바르지 않습니다." }, { status: 400 });
    const dup = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (dup.length > 0 && dup[0].id !== user.id) {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 409 });
    }
    if (email !== user.email) {
      updates.email = email;
      newEmail = email;
    }
  }

  if (body.newPassword !== undefined) {
    const pwErr = validatePasswordPolicy(String(body.newPassword));
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
    updates.passwordHash = await hashPassword(String(body.newPassword));
    updates.mustChangePassword = 0;
  }

  await db.update(users).set(updates).where(eq(users.id, user.id));

  await db.insert(adminActions).values({
    adminId: user.id,
    targetUserId: user.id,
    action: "edit_profile",
    detail: "본인 정보 수정",
  });

  // 이메일이 바뀌면 새 주소를 다시 인증받습니다(인증이 켜진 경우). 인증 전까지 다음 로그인은 막힙니다.
  let verificationSent = false;
  if (newEmail && isEmailVerificationEnforced()) {
    try {
      await markEmailUnverified(user.id);
      const raw = await createToken(user.id, "verify_email", 24 * 60 * 60_000);
      const mail = verificationEmail(updates.name ?? user.name, `${appBaseUrl(req)}/verify-email?token=${raw}`);
      verificationSent = (await sendMail({ to: newEmail, ...mail })).ok;
    } catch (e) {
      console.error("[me] 이메일 재인증 준비 실패:", e instanceof Error ? e.message : e);
    }
  }

  const res = NextResponse.json({ ok: true, verificationSent });
  // 비밀번호를 바꾸면 이전 세션(다른 기기·탈취된 세션 포함)은 모두 무효가 되므로, 지금 이 기기에는 새 세션을 바로 발급합니다.
  if (updates.passwordHash) {
    res.cookies.set(
      SESSION_COOKIE,
      signSession({ uid: user.id, role: user.role, status: user.status, pv: passwordFingerprint(updates.passwordHash), sid: verifySession(req.cookies.get(SESSION_COOKIE)?.value ?? "")?.sid }),
      sessionCookieOptions()
    );
  }
  return res;
}
