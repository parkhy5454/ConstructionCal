import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, adminActions } from "@/lib/schema";
import { getCurrentUser } from "@/lib/currentUser";
import { verifyPassword, hashPassword, validatePasswordPolicy, validateEmail } from "@/lib/auth";

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
    updates.email = email;
  }

  if (body.newPassword !== undefined) {
    const currentPassword = String(body.currentPassword ?? "");
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 401 });
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

  return NextResponse.json({ ok: true });
}
