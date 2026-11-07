import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireAdmin } from "@/lib/currentUser";
import { listSecurity } from "@/lib/security";
import { listSubscriptions, computeStatus, trialDays } from "@/lib/subscription";
import { loginStats } from "@/lib/loginEvents";
import { disciplinePlanOn, getDisciplineMap } from "@/lib/disciplineAccess";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      referralCode: users.referralCode,
      referredBy: users.referredBy,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  // 2FA 사용 여부 / 이메일 인증 여부 (emailVerified null = 인증 대상 아님: 기존 가입자 등)
  const sec = await listSecurity();
  const subs = await listSubscriptions();
  const logins = await loginStats();
  const dmap = await getDisciplineMap();
  const trialOn = trialDays() > 0;
  const enriched = rows.map((u) => {
    const s = sec.get(u.id);
    const info = computeStatus({ enabled: trialOn, role: u.role, row: subs.get(u.id) ?? null });
    return {
      ...u,
      totpEnabled: s?.totpEnabled === 1,
      emailVerified: s ? !!s.emailVerifiedAt : null,
      subStatus: info.status, // off | admin | paid | trial | expired (체험 시작 전 신규 계정은 expired로 보일 수 있어 아래에서 보정)
      subUntil: info.until ? info.until.toISOString() : null,
      subDaysLeft: info.daysLeft,
      subStarted: subs.has(u.id),
      disciplines: dmap.get(u.id) ?? null,
      lastLoginAt: logins.get(u.id)?.lastAt ?? null,
      ips7: logins.get(u.id)?.ips7 ?? 0,
      ips30: logins.get(u.id)?.ips30 ?? 0,
    };
  });

  return NextResponse.json({ users: enriched, trialDays: trialDays(), disciplinePlan: disciplinePlanOn() });
}
