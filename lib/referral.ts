// 추천 보상: 추천받은 사람이 승인되면 추천한 사람과 가입한 사람 모두에게 구독 기간을 더해 줍니다.
// - 체험/구독 기능(TRIAL_DAYS)이 켜져 있을 때만 동작합니다. 보상 일수는 REFERRAL_REWARD_DAYS(기본 30, 0이면 끔).
// - 한 사람이 두 번 보상받지 않도록 admin_actions에 기록하고, 추천인당 최대 12건까지만 지급합니다(어뷰징 방지).
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./db";
import { users, adminActions } from "./schema";
import { extendPaid, trialDays } from "./subscription";
import { isMissingTable } from "./security";

type Db = ReturnType<typeof getDb>;
export const REFERRAL_MAX_REWARDS = 12;

export function referralRewardDays(): number {
  const raw = process.env.REFERRAL_REWARD_DAYS;
  const n = raw === undefined || raw === "" ? 30 : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 365) : 0;
}

export type RewardResult = { granted: boolean; reason?: string; days?: number };

export async function grantReferralReward(
  target: { id: number; referredBy: string | null },
  adminId: number,
  db: Db = getDb()
): Promise<RewardResult> {
  const days = referralRewardDays();
  if (trialDays() <= 0 || days <= 0) return { granted: false, reason: "disabled" };
  if (!target.referredBy) return { granted: false, reason: "no_referrer" };

  const ref = (await db.select().from(users).where(eq(users.referralCode, target.referredBy)).limit(1))[0];
  if (!ref || ref.id === target.id || ref.status !== "approved") return { granted: false, reason: "invalid_referrer" };

  const already = await db.select({ id: adminActions.id }).from(adminActions)
    .where(and(eq(adminActions.targetUserId, target.id), eq(adminActions.action, "referral_reward"))).limit(1);
  if (already.length > 0) return { granted: false, reason: "already_rewarded" };

  const cnt = await db.select({ n: sql<number>`count(*)` }).from(adminActions)
    .where(and(eq(adminActions.action, "referral_reward"), sql`${adminActions.detail} like ${`referrer=${ref.id} %`}`));
  if (Number(cnt[0]?.n ?? 0) >= REFERRAL_MAX_REWARDS) return { granted: false, reason: "referrer_cap" };

  try {
    await extendPaid(ref.id, days, db);
    await extendPaid(target.id, days, db);
  } catch (e) {
    if (isMissingTable(e)) return { granted: false, reason: "subscriptions_table_missing" };
    throw e;
  }
  await db.insert(adminActions).values({ adminId, targetUserId: target.id, action: "referral_reward", detail: `referrer=${ref.id} days=${days}` });
  return { granted: true, days };
}
