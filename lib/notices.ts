// 체험/구독 종료 안내 메일(크론으로 매일 실행). 같은 안내는 notice_log로 중복 발송을 막습니다.
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, subscriptions, noticeLog } from "./schema";
import { sendMail, noticeEmail, mailConfigured } from "./mailer";
import { trialDays } from "./subscription";
import { purgeOldLogins } from "./loginEvents";
import { isMissingTable } from "./security";

type Db = ReturnType<typeof getDb>;
const DAY = 86400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export type NoticeSummary = { disabled?: string; sent: Record<string, number>; failed: number };

type Candidate = { userId: number; name: string; email: string; kind: "trial_d3" | "paid_d7" | "expired"; ref: string; endsAt: Date };

export function buildMail(c: Candidate, pricingUrl: string) {
  const when = c.endsAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  if (c.kind === "trial_d3") {
    return noticeEmail({
      subject: "[ConCal] 무료 체험이 곧 끝납니다", name: c.name,
      lines: [`무료 체험이 ${when}에 종료됩니다.`, "종료 후에는 읽기 전용으로 바뀌어 견적서 조회·엑셀 다운로드·인쇄만 가능하고, 저장과 수정은 구독 후에 이어갈 수 있습니다. 작성하신 데이터는 그대로 보관됩니다."],
      cta: { label: "요금 안내 보기", url: pricingUrl }, footer: "이 메일은 서비스 이용 안내를 위해 발송되었습니다.",
    });
  }
  if (c.kind === "paid_d7") {
    return noticeEmail({
      subject: "[ConCal] 구독 만료가 가까워졌습니다", name: c.name,
      lines: [`현재 구독이 ${when}에 만료됩니다.`, "만료 후에는 읽기 전용으로 바뀝니다. 계속 사용하시려면 만료 전에 연장해 주세요."],
      cta: { label: "요금 안내 보기", url: pricingUrl }, footer: "이 메일은 서비스 이용 안내를 위해 발송되었습니다.",
    });
  }
  return noticeEmail({
    subject: "[ConCal] 이용 기간이 종료되었습니다", name: c.name,
    lines: [`이용 기간이 ${when}에 종료되어 현재 읽기 전용 상태입니다.`, "견적서 조회·엑셀 다운로드·인쇄는 계속 가능하고 데이터는 그대로 보관됩니다. 구독하시면 바로 이어서 수정할 수 있습니다."],
    cta: { label: "요금 안내 보기", url: pricingUrl }, footer: "이 메일은 서비스 이용 안내를 위해 발송되었습니다.",
  });
}

export async function findCandidates(now: Date, db: Db = getDb()): Promise<Candidate[]> {
  const rows = await db
    .select({ userId: subscriptions.userId, name: users.name, email: users.email, trialEndsAt: subscriptions.trialEndsAt, paidUntil: subscriptions.paidUntil })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(eq(users.status, "approved"), eq(users.role, "user")));
  const out: Candidate[] = [];
  for (const r of rows) {
    const paid = r.paidUntil, trial = r.trialEndsAt;
    const end = paid && trial ? (paid > trial ? paid : trial) : paid ?? trial;
    if (!end) continue;
    const left = end.getTime() - now.getTime();
    const base = { userId: r.userId, name: r.name, email: r.email, endsAt: end, ref: dayKey(end) };
    const endingIsPaid = !!paid && paid.getTime() >= (trial?.getTime() ?? 0);
    if (left > 0) {
      if (endingIsPaid && left <= 7 * DAY) out.push({ ...base, kind: "paid_d7" });
      else if (!endingIsPaid && left <= 3 * DAY) out.push({ ...base, kind: "trial_d3" });
    } else if (left > -2 * DAY) {
      out.push({ ...base, kind: "expired" });
    }
  }
  return out;
}

export async function runNoticeJob(now = new Date(), db: Db = getDb(), pricingUrl = "/pricing"): Promise<NoticeSummary> {
  const summary: NoticeSummary = { sent: {}, failed: 0 };
  await purgeOldLogins(db);
  if (trialDays() <= 0) return { ...summary, disabled: "TRIAL_DAYS 미설정" };
  if (!mailConfigured()) return { ...summary, disabled: "메일 발송 미설정(RESEND_API_KEY/EMAIL_FROM)" };
  let cands: Candidate[];
  try {
    cands = await findCandidates(now, db);
  } catch (e) {
    if (isMissingTable(e)) return { ...summary, disabled: "구독 테이블 없음" };
    throw e;
  }
  for (const c of cands) {
    try {
      // 먼저 "보냈음"을 선점(중복 실행 방지) → 발송 실패하면 선점을 풀어 다음 실행에서 재시도
      const claimed = await db.insert(noticeLog).values({ userId: c.userId, kind: c.kind, ref: c.ref }).onConflictDoNothing().returning({ id: noticeLog.id });
      if (claimed.length === 0) continue;
      const mail = buildMail(c, pricingUrl);
      const r = await sendMail({ to: c.email, ...mail });
      if (!r.ok) {
        summary.failed += 1;
        await db.delete(noticeLog).where(eq(noticeLog.id, claimed[0].id));
      } else {
        summary.sent[c.kind] = (summary.sent[c.kind] ?? 0) + 1;
      }
    } catch (e) {
      if (isMissingTable(e)) return { ...summary, disabled: "notice_log 테이블 없음" };
      throw e;
    }
  }
  return summary;
}
