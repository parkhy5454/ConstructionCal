import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, projects, inquiries } from "@/lib/schema";
import { requireAdmin } from "@/lib/currentUser";
import { listSubscriptions, computeStatus, trialDays } from "@/lib/subscription";
import { loginStats } from "@/lib/loginEvents";
import { isMissingTable } from "@/lib/security";

export const runtime = "nodejs";

// 관리자 요약: 가입 퍼널(가입→승인→접속→견적 작성→체험/구독 상태)과 최근 문의.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const db = getDb();
  const all = await db.select({ id: users.id, role: users.role, status: users.status, createdAt: users.createdAt }).from(users);
  const members = all.filter((u) => u.role === "user");
  const day = 86400_000, now = Date.now();
  const approved = members.filter((u) => u.status === "approved");

  // 예시 견적서(자동 생성) 말고 직접 만든 견적서가 있는 사용자
  const made = await db.select({ userId: projects.userId, n: sql<number>`count(*)` }).from(projects).where(sql`${projects.name} <> '예시 견적서'`).groupBy(projects.userId);
  const madeSet = new Set(made.map((m) => m.userId));
  const logins = await loginStats();

  const subs = await listSubscriptions();
  const on = trialDays() > 0;
  const counts = { trial: 0, paid: 0, expired: 0, notStarted: 0 };
  for (const u of approved) {
    if (!on) break;
    const row = subs.get(u.id);
    if (!row) { counts.notStarted += 1; continue; }
    const s = computeStatus({ enabled: true, role: "user", row }).status;
    if (s === "trial") counts.trial += 1; else if (s === "paid") counts.paid += 1; else counts.expired += 1;
  }

  let inq: Array<{ id: number; name: string; email: string; message: string; status: string; createdAt: Date }> = [];
  try {
    inq = await db.select({ id: inquiries.id, name: inquiries.name, email: inquiries.email, message: inquiries.message, status: inquiries.status, createdAt: inquiries.createdAt })
      .from(inquiries).orderBy(desc(inquiries.id)).limit(30);
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }

  return NextResponse.json({
    funnel: {
      signups: members.length,
      signups7d: members.filter((u) => now - new Date(u.createdAt).getTime() < 7 * day).length,
      signups30d: members.filter((u) => now - new Date(u.createdAt).getTime() < 30 * day).length,
      pending: members.filter((u) => u.status === "pending").length,
      approved: approved.length,
      loggedIn: approved.filter((u) => logins.has(u.id)).length,
      madeEstimate: approved.filter((u) => madeSet.has(u.id)).length,
      ...counts,
      subscriptionOn: on,
    },
    inquiries: inq,
    unreadInquiries: inq.filter((i) => i.status === "new").length,
  });
}

// 문의 처리 완료/되돌리기
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const id = Number(body?.inquiryId);
  const status = body?.status === "new" ? "new" : "done";
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  await getDb().update(inquiries).set({ status }).where(eq(inquiries.id, id));
  return NextResponse.json({ ok: true });
}
