// 무료 체험 / 구독 상태.
//
// - TRIAL_DAYS(환경변수)가 0이거나 없으면 기능 전체가 꺼져 있어 아무 제한도 없습니다(기본값).
// - 켜면: 첫 이용 시점부터 TRIAL_DAYS일 무료 체험 → 끝나면 "읽기 전용"(조회·엑셀 다운로드·인쇄는 가능, 저장·수정은 차단).
// - 관리자는 항상 제한 없음. 관리자가 paid_until을 연장하면 그 기간 동안 정상 이용(결제 연동 전 수동 구독 처리용).
// - subscriptions 테이블이 아직 없으면(마이그레이션 전) 제한 없이 동작합니다.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { subscriptions } from "./schema";
import { isMissingTable } from "./security";

type Db = ReturnType<typeof getDb>;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type SubStatus = "off" | "admin" | "paid" | "trial" | "expired";
export type SubInfo = { status: SubStatus; daysLeft: number | null; until: Date | null };

const DAY = 24 * 60 * 60_000;

export function trialDays(): number {
  const n = Number(process.env.TRIAL_DAYS);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 365) : 0;
}

// 순수 함수(테스트 용이): 현재 상태 계산
export function computeStatus(opts: { enabled: boolean; role: string; row: Pick<SubscriptionRow, "trialEndsAt" | "paidUntil"> | null; now?: Date }): SubInfo {
  const now = opts.now ?? new Date();
  if (!opts.enabled) return { status: "off", daysLeft: null, until: null };
  if (opts.role === "admin") return { status: "admin", daysLeft: null, until: null };
  const paid = opts.row?.paidUntil ?? null;
  const trial = opts.row?.trialEndsAt ?? null;
  if (paid && paid.getTime() > now.getTime()) return { status: "paid", daysLeft: Math.ceil((paid.getTime() - now.getTime()) / DAY), until: paid };
  if (trial && trial.getTime() > now.getTime()) return { status: "trial", daysLeft: Math.ceil((trial.getTime() - now.getTime()) / DAY), until: trial };
  return { status: "expired", daysLeft: 0, until: paid && trial ? (paid > trial ? paid : trial) : paid ?? trial };
}

export async function getSubscriptionInfo(user: { id: number; role: string }, db: Db = getDb()): Promise<SubInfo> {
  const days = trialDays();
  if (days <= 0) return computeStatus({ enabled: false, role: user.role, row: null });
  if (user.role === "admin") return computeStatus({ enabled: true, role: user.role, row: null });
  try {
    let rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    if (rows.length === 0) {
      // 처음 이용하는 시점에 체험 기간을 시작합니다(동시 요청이 와도 onConflictDoNothing으로 한 번만 생성).
      await db.insert(subscriptions).values({ userId: user.id, trialEndsAt: new Date(Date.now() + days * DAY) }).onConflictDoNothing();
      rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
    }
    return computeStatus({ enabled: true, role: user.role, row: rows[0] ?? null });
  } catch (e) {
    if (isMissingTable(e)) return computeStatus({ enabled: false, role: user.role, row: null });
    throw e;
  }
}

// 쓰기 API 가드: 체험이 끝나 읽기 전용이면 402 응답을 돌려줍니다(통과면 null).
export async function subscriptionBlock(user: { id: number; role: string }): Promise<NextResponse | null> {
  const info = await getSubscriptionInfo(user);
  if (info.status !== "expired") return null;
  return NextResponse.json(
    { error: "무료 체험(또는 구독)이 종료되어 읽기 전용 상태입니다. 조회·엑셀 다운로드·인쇄는 계속 가능합니다. 이용 연장은 운영자에게 문의하세요.", subscriptionExpired: true },
    { status: 402 }
  );
}

// 관리자 수동 연장: 현재 만료일(없거나 지났으면 지금)부터 days일 추가. days가 음수면 줄이고, 0 이하 결과는 즉시 만료.
export async function extendPaid(userId: number, days: number, db: Db = getDb()): Promise<Date> {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const cur = rows[0]?.paidUntil;
  const base = cur && cur.getTime() > Date.now() ? cur : new Date();
  const next = new Date(base.getTime() + days * DAY);
  await db
    .insert(subscriptions)
    .values({ userId, paidUntil: next })
    .onConflictDoUpdate({ target: subscriptions.userId, set: { paidUntil: next, updatedAt: new Date() } });
  return next;
}

export async function listSubscriptions(db: Db = getDb()): Promise<Map<number, SubscriptionRow>> {
  try {
    const rows = await db.select().from(subscriptions);
    return new Map(rows.map((r) => [r.userId, r]));
  } catch (e) {
    if (isMissingTable(e)) return new Map();
    throw e;
  }
}
