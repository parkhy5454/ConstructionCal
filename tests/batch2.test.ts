import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../lib/schema";
import { users, projects, bomItems, materials, adminActions, subscriptions, noticeLog, loginEvents, inquiries } from "../lib/schema";
import { deleteUserAccount, exportUserData, LastAdminError } from "../lib/account";
import { grantReferralReward, REFERRAL_MAX_REWARDS } from "../lib/referral";
import { findCandidates, runNoticeJob } from "../lib/notices";
import { estimateWarnings } from "../lib/warnings";
import { isKnownEnvironment, loginStats, recentLogins, maskIp, describeAgent, purgeOldLogins } from "../lib/loginEvents";
import type { Material, BomItem, ComputeResult } from "../lib/calc";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };
const DAY = 86400000;

async function main() {
  const pg = new PGlite();
  const db: any = drizzle(pg, { schema });
  for (const f of fs.readdirSync("drizzle").filter((x) => x.endsWith(".sql")).sort()) {
    for (const stmt of fs.readFileSync(`drizzle/${f}`, "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
  }
  const mk = async (name: string, over: Partial<typeof users.$inferInsert> = {}) =>
    (await db.insert(users).values({ name, email: `${name}@t.com`, passwordHash: "x", referralCode: `C${name}`.slice(0, 16), status: "approved", ...over }).returning())[0];

  // ---------- 회원 탈퇴 ----------
  const admin = await mk("admin", { role: "admin" });
  const u = await mk("u1");
  const other = await mk("u2");
  const [p] = await db.insert(projects).values({ userId: u.id, discipline: "electrical", name: "내 견적" }).returning();
  const [m] = await db.insert(materials).values({ userId: u.id, discipline: "electrical", name: "전선", spec: "2.5", unit: "m", price: 100 } as any).returning();
  await db.insert(bomItems).values({ projectId: p.id, groupName: "A", materialId: m.id, qty: 3, sortOrder: 0 });
  const [p2] = await db.insert(projects).values({ userId: other.id, discipline: "electrical", name: "남의 견적" }).returning();
  await db.insert(inquiries).values({ userId: u.id, name: "u1", email: "u1@t.com", message: "hi" });
  await db.insert(loginEvents).values({ userId: u.id, ip: "1.2.3.4", userAgent: "x" });
  await db.insert(adminActions).values({ adminId: admin.id, targetUserId: u.id, action: "approve" });

  const exp = await exportUserData(u.id, db);
  const json = JSON.stringify(exp);
  ok(json.includes("내 견적") && !json.includes("남의 견적"), "내보내기에는 내 데이터만 포함");
  ok(!json.includes("passwordHash") && !json.includes("password_hash"), "내보내기에 비밀번호 해시 없음");

  await deleteUserAccount(u.id, db);
  ok((await db.select().from(users).where(eq(users.id, u.id))).length === 0, "탈퇴: 사용자 행 삭제");
  ok((await db.select().from(projects).where(eq(projects.userId, u.id))).length === 0, "탈퇴: 견적서 삭제");
  ok((await db.select().from(bomItems).where(eq(bomItems.projectId, p.id))).length === 0, "탈퇴: 물량 행 삭제");
  ok((await db.select().from(materials).where(eq(materials.userId, u.id))).length === 0, "탈퇴: 자재 삭제");
  ok((await db.select().from(inquiries).where(eq(inquiries.userId, u.id))).length === 0, "탈퇴: 문의 삭제");
  ok((await db.select().from(loginEvents).where(eq(loginEvents.userId, u.id))).length === 0, "탈퇴: 로그인 기록 삭제");
  ok((await db.select().from(adminActions).where(eq(adminActions.targetUserId, u.id))).length === 1, "탈퇴: 관리자 조치 이력은 보존");
  ok((await db.select().from(projects).where(eq(projects.id, p2.id))).length === 1, "탈퇴가 다른 사용자 데이터를 건드리지 않음");
  let threw = false;
  try { await deleteUserAccount(admin.id, db); } catch (e) { threw = e instanceof LastAdminError; }
  ok(threw, "마지막 관리자는 탈퇴 불가");
  await deleteUserAccount(99999, db);
  ok(true, "없는 사용자 탈퇴는 조용히 통과");

  // ---------- 추천 보상 ----------
  process.env.TRIAL_DAYS = "14"; process.env.REFERRAL_REWARD_DAYS = "30";
  const ref = await mk("ref");
  const f1 = await mk("f1", { referredBy: ref.referralCode });
  const r1 = await grantReferralReward({ id: f1.id, referredBy: f1.referredBy }, admin.id, db);
  ok(r1.granted && r1.days === 30, "추천 보상 지급 (30일)");
  const s = await db.select().from(subscriptions);
  ok(s.some((x: any) => x.userId === ref.id && x.paidUntil) && s.some((x: any) => x.userId === f1.id && x.paidUntil), "추천인·가입자 모두 기간 연장");
  const r2 = await grantReferralReward({ id: f1.id, referredBy: f1.referredBy }, admin.id, db);
  ok(!r2.granted && r2.reason === "already_rewarded", "같은 사람은 두 번 보상받지 못함");
  const self = await mk("selfref");
  const rs = await grantReferralReward({ id: self.id, referredBy: self.referralCode }, admin.id, db);
  ok(!rs.granted, "자기 자신 추천은 보상 없음");
  const pend = await mk("pend", { status: "pending" });
  const f2 = await mk("f2", { referredBy: pend.referralCode });
  ok(!(await grantReferralReward({ id: f2.id, referredBy: f2.referredBy }, admin.id, db)).granted, "미승인 추천인은 보상 없음");
  ok(!(await grantReferralReward({ id: f2.id, referredBy: null }, admin.id, db)).granted, "추천인 없으면 보상 없음");
  for (let i = 0; i < REFERRAL_MAX_REWARDS - 1; i++) {
    const f = await mk(`cap${i}`, { referredBy: ref.referralCode });
    await grantReferralReward({ id: f.id, referredBy: f.referredBy }, admin.id, db);
  }
  const over = await mk("capover", { referredBy: ref.referralCode });
  const ro = await grantReferralReward({ id: over.id, referredBy: over.referredBy }, admin.id, db);
  ok(!ro.granted && ro.reason === "referrer_cap", `추천인당 최대 ${REFERRAL_MAX_REWARDS}건 제한`);
  process.env.REFERRAL_REWARD_DAYS = "0";
  ok((await grantReferralReward({ id: over.id, referredBy: over.referredBy }, admin.id, db)).reason === "disabled", "REFERRAL_REWARD_DAYS=0이면 꺼짐");
  process.env.REFERRAL_REWARD_DAYS = "30";

  // ---------- 종료 안내 ----------
  await db.delete(subscriptions);
  await db.delete(noticeLog);
  const now = new Date();
  const a = await mk("n_trial"), b = await mk("n_paid"), c = await mk("n_exp"), d = await mk("n_far");
  await db.insert(subscriptions).values([
    { userId: a.id, trialEndsAt: new Date(now.getTime() + 2 * DAY) },
    { userId: b.id, trialEndsAt: new Date(now.getTime() - 30 * DAY), paidUntil: new Date(now.getTime() + 5 * DAY) },
    { userId: c.id, trialEndsAt: new Date(now.getTime() - 1 * DAY) },
    { userId: d.id, trialEndsAt: new Date(now.getTime() + 10 * DAY) },
  ]);
  const cands = await findCandidates(now, db);
  const kindOf = (id: number) => cands.find((x) => x.userId === id)?.kind;
  ok(kindOf(a.id) === "trial_d3" && kindOf(b.id) === "paid_d7" && kindOf(c.id) === "expired" && kindOf(d.id) === undefined, "안내 대상 분류 (체험 3일 전/구독 7일 전/만료/먼 미래 제외)");

  delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
  ok(!!(await runNoticeJob(now, db)).disabled, "메일 미설정이면 발송 안 함");
  process.env.RESEND_API_KEY = "k"; process.env.EMAIL_FROM = "t <t@t.com>";
  const sent: string[] = [];
  let failNext = false;
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async (_u: string, init: any) => {
    const body = JSON.parse(init.body);
    if (failNext) { failNext = false; return new Response("no", { status: 500 }); }
    sent.push(body.to?.[0] ?? body.to);
    return new Response("{}", { status: 200 });
  };
  failNext = true;
  const j1 = await runNoticeJob(now, db);
  ok(j1.failed === 1, "발송 실패는 failed로 집계");
  const j2 = await runNoticeJob(now, db);
  ok(Object.values(j2.sent).reduce((x, y) => x + y, 0) >= 1, "실패한 건은 다음 실행에서 재시도");
  const before = sent.length;
  const j3 = await runNoticeJob(now, db);
  ok(sent.length === before && Object.keys(j3.sent).length === 0, "이미 보낸 안내는 다시 보내지 않음(중복 방지)");
  ok(sent.length === 3, `대상 3명에게 각 1회씩만 발송 (${sent.length}건)`);
  (globalThis as any).fetch = realFetch;

  // ---------- 로그인 기록 ----------
  const lu = await mk("login");
  await db.insert(loginEvents).values([
    { userId: lu.id, ip: "1.1.1.1", userAgent: "UA-A" },
    { userId: lu.id, ip: "2.2.2.2", userAgent: "UA-A" },
    { userId: lu.id, ip: "3.3.3.3", userAgent: "UA-A" },
  ]);
  await db.insert(loginEvents).values({ userId: lu.id, ip: "9.9.9.9", userAgent: "old", createdAt: new Date(now.getTime() - 100 * DAY) });
  await db.insert(loginEvents).values({ userId: lu.id, ip: "8.8.8.8", userAgent: "mid", createdAt: new Date(now.getTime() - 20 * DAY) });
  const st = (await loginStats(db)).get(lu.id);
  ok(st?.ips7 === 3 && st?.ips30 === 4, `서로 다른 IP 수 집계 (7일 ${st?.ips7}, 30일 ${st?.ips30})`);
  ok(await isKnownEnvironment(lu.id, "1.1.1.1", "UA-A", db), "최근에 쓴 환경은 아는 환경");
  ok(!(await isKnownEnvironment(lu.id, "5.5.5.5", "UA-A", db)), "처음 보는 IP는 새 환경");
  ok(!(await isKnownEnvironment(lu.id, "9.9.9.9", "old", db)), "30일 지난 환경은 새 환경 취급");
  await purgeOldLogins(db);
  ok((await db.select().from(loginEvents).where(eq(loginEvents.ip, "9.9.9.9"))).length === 0, "90일 지난 기록 삭제");
  const rl = await recentLogins(lu.id, 10, db);
  ok(rl.length === 4 && rl.every((r: any) => !/^\d+\.\d+\.\d+\.\d+$/.test(r.ip)), "최근 로그인 목록은 IP를 가려서 보여줌");
  ok(maskIp("203.0.113.7") === "203.0.*.*" && maskIp("2001:db8:1:2::1").endsWith(":*"), "IP 마스킹");
  ok(describeAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 Safari/537") === "Windows · Chrome", "브라우저/OS 표기");

  // ---------- 검토 알림 ----------
  const M = (id: number, price: number, unit = "m"): Material => ({ id, name: `자재${id}`, spec: "", unit, price } as Material);
  const B = (id: number, materialId: number, qty: number, groupName = "A"): BomItem => ({ id, groupName, materialId, qty });
  const R = (sumMat: number, sumLabor: number) => ({ sumMat, sumLabor } as ComputeResult);
  const has = (w: ReturnType<typeof estimateWarnings>, s: string) => w.some((x) => x.text.includes(s));
  ok(estimateWarnings([M(1, 100)], [B(1, 1, 5)], R(500, 100)).length === 0, "정상 견적은 경고 없음");
  ok(has(estimateWarnings([M(1, 100)], [B(1, 2, 5)], R(0, 0)), "삭제된 자재"), "삭제된 자재 참조 경고");
  ok(has(estimateWarnings([M(1, 0)], [B(1, 1, 5)], R(0, 0)), "0원"), "단가 0원 경고");
  ok(has(estimateWarnings([M(1, 100, "개")], [B(1, 1, 2.5)], R(1, 1)), "소수 수량"), "개수 단위 소수 수량 경고");
  ok(!has(estimateWarnings([M(1, 100, "m")], [B(1, 1, 2.5)], R(1, 1)), "소수 수량"), "m 단위 소수 수량은 정상");
  ok(has(estimateWarnings([M(1, 100)], [B(1, 1, 100000)], R(1, 1)), "10만"), "과도한 수량 경고");
  ok(has(estimateWarnings([M(1, 100)], [B(1, 1, 1), B(2, 1, 2)], R(1, 1)), "여러 행"), "중복 행 안내");
  ok(has(estimateWarnings([M(1, 100)], [B(1, 1, 0)], R(1, 1)), "수량이 0"), "수량 0 안내");
  ok(has(estimateWarnings([M(1, 100)], [B(1, 1, 5)], R(500, 0)), "노무비가 전혀"), "노무비 0 경고");

  if (fails) { console.log(`\n${fails}건 실패`); process.exit(1); }
  console.log("\n전부 통과");
}
main().catch((e) => { console.error(e); process.exit(1); });
