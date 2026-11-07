import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, adminActions } from "@/lib/schema";
import { requireAdmin } from "@/lib/currentUser";
import { hashPassword, validatePasswordPolicy, validateEmail } from "@/lib/auth";
import { extendPaid } from "@/lib/subscription";
import { isMissingTable } from "@/lib/security";
import { disableTotp, markEmailVerified, SecurityTablesMissingError } from "@/lib/security";

export const runtime = "nodejs";

// 관리자가 가입자 승인/반려, 권한 변경, 비밀번호 재설정, 정보 수정을 처리합니다.
// 자기 자신의 role/status는 이 API로 바꿀 수 없게 막아 관리자 전원이 실수로
// 잠겨버리는(lockout) 상황을 방지합니다.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const targetId = Number(params.id);
  if (!Number.isInteger(targetId)) return NextResponse.json({ error: "잘못된 사용자 ID." }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  const target = rows[0];

  const isSelf = target.id === admin.id;
  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  const logs: { action: string; detail: string }[] = [];

  if (body.status !== undefined) {
    if (isSelf) return NextResponse.json({ error: "본인의 승인 상태는 변경할 수 없습니다." }, { status: 400 });
    if (!["pending", "approved", "rejected"].includes(body.status)) {
      return NextResponse.json({ error: "잘못된 상태 값입니다." }, { status: 400 });
    }
    updates.status = body.status;
    logs.push({ action: body.status === "approved" ? "approve" : body.status === "rejected" ? "reject" : "set_status", detail: `status -> ${body.status}` });
  }

  if (body.role !== undefined) {
    if (isSelf) return NextResponse.json({ error: "본인의 권한은 변경할 수 없습니다." }, { status: 400 });
    if (!["user", "admin"].includes(body.role)) {
      return NextResponse.json({ error: "잘못된 권한 값입니다." }, { status: 400 });
    }
    updates.role = body.role;
    logs.push({ action: "set_role", detail: `role -> ${body.role}` });
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 80) return NextResponse.json({ error: "이름이 올바르지 않습니다." }, { status: 400 });
    updates.name = name;
    logs.push({ action: "edit_profile", detail: "name 변경" });
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!validateEmail(email)) return NextResponse.json({ error: "이메일 형식이 올바르지 않습니다." }, { status: 400 });
    const dup = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (dup.length > 0 && dup[0].id !== target.id) {
      return NextResponse.json({ error: "이미 사용 중인 이메일입니다." }, { status: 409 });
    }
    updates.email = email;
    logs.push({ action: "edit_profile", detail: "email 변경" });
  }

  if (body.newPassword !== undefined) {
    const pwErr = validatePasswordPolicy(String(body.newPassword));
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
    updates.passwordHash = await hashPassword(String(body.newPassword));
    updates.mustChangePassword = 1; // 관리자가 재설정하면 다음 로그인 시 반드시 변경하도록 강제
    logs.push({ action: "reset_password", detail: "관리자가 비밀번호 재설정 (평문 비밀번호는 로그에 남기지 않음)" });
  }

  // 보안 조치: 2FA 해제(인증 앱·복구 코드를 모두 잃은 사용자 구제), 이메일 인증 수동 처리(메일이 안 가는 경우).
  // 본인에게는 이 경로를 쓸 수 없습니다 — 본인의 2FA는 '내 정보'에서 비밀번호+코드로만 해제할 수 있습니다.
  const secActions: Array<"disable_2fa" | "verify_email"> = [];
  if (body.disable2fa === true) {
    if (isSelf) return NextResponse.json({ error: "본인의 2단계 인증은 '내 정보'에서 해제하세요." }, { status: 400 });
    secActions.push("disable_2fa");
  }
  if (body.verifyEmail === true) secActions.push("verify_email");

  // 구독 기간 수동 연장(결제 연동 전 운영용). 양수=연장, 음수=단축. 현재 만료일(없거나 지났으면 지금) 기준.
  let extendDays: number | null = null;
  if (body.extendDays !== undefined) {
    const n = Number(body.extendDays);
    if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 3650) {
      return NextResponse.json({ error: "연장 일수는 0이 아닌 정수(최대 ±3650)여야 합니다." }, { status: 400 });
    }
    extendDays = n;
  }

  if (Object.keys(updates).length <= 1 && secActions.length === 0 && extendDays === null) {
    return NextResponse.json({ error: "변경할 항목이 없습니다." }, { status: 400 });
  }

  try {
    for (const a of secActions) {
      if (a === "disable_2fa") await disableTotp(target.id);
      else await markEmailVerified(target.id);
      logs.push({ action: a, detail: a === "disable_2fa" ? "관리자가 2단계 인증을 해제" : "관리자가 이메일 인증을 수동 처리" });
    }
  } catch (e) {
    if (e instanceof SecurityTablesMissingError) {
      return NextResponse.json({ error: "보안 기능 테이블이 아직 없습니다. 운영 DB에 npm run db:push를 먼저 실행하세요." }, { status: 503 });
    }
    throw e;
  }

  if (extendDays !== null) {
    try {
      const until = await extendPaid(target.id, extendDays);
      logs.push({ action: "extend_subscription", detail: `구독 ${extendDays > 0 ? "+" : ""}${extendDays}일 → ${until.toISOString().slice(0, 10)}까지` });
    } catch (e) {
      if (isMissingTable(e)) {
        return NextResponse.json({ error: "구독 테이블이 아직 없습니다. 운영 DB에 npm run db:push를 먼저 실행하세요." }, { status: 503 });
      }
      throw e;
    }
  }

  if (Object.keys(updates).length > 1) {
    await db.update(users).set(updates).where(eq(users.id, targetId));
  }

  for (const l of logs) {
    await db.insert(adminActions).values({
      adminId: admin.id,
      targetUserId: targetId,
      action: l.action,
      detail: l.detail,
    });
  }

  return NextResponse.json({ ok: true });
}
