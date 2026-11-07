import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/schema";
import { computeStatus, getSubscriptionInfo, extendPaid, trialDays } from "../lib/subscription";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };
const DAY = 86400000;

async function main() {
  const now = new Date("2026-11-07T00:00:00Z");
  const t = (d: number) => new Date(now.getTime() + d * DAY);
  ok(computeStatus({ enabled: false, role: "user", row: null, now }).status === "off", "기능 꺼짐이면 off(제한 없음)");
  ok(computeStatus({ enabled: true, role: "admin", row: null, now }).status === "admin", "관리자는 제한 없음");
  ok(computeStatus({ enabled: true, role: "user", row: { trialEndsAt: t(5), paidUntil: null }, now }).status === "trial", "체험 기간 내 → trial");
  ok(computeStatus({ enabled: true, role: "user", row: { trialEndsAt: t(5), paidUntil: null }, now }).daysLeft === 5, "남은 일수 5");
  ok(computeStatus({ enabled: true, role: "user", row: { trialEndsAt: t(-1), paidUntil: null }, now }).status === "expired", "체험 종료 → expired");
  ok(computeStatus({ enabled: true, role: "user", row: { trialEndsAt: t(-10), paidUntil: t(30) }, now }).status === "paid", "구독 기간 내 → paid");
  ok(computeStatus({ enabled: true, role: "user", row: { trialEndsAt: t(-10), paidUntil: t(-1) }, now }).status === "expired", "구독 만료 → expired");
  ok(computeStatus({ enabled: true, role: "user", row: { trialEndsAt: t(3), paidUntil: t(-1) }, now }).status === "trial", "구독은 끝났어도 체험이 남았으면 trial");

  const pg = new PGlite();
  const db: any = drizzle(pg, { schema });
  process.env.TRIAL_DAYS = "14";
  ok(trialDays() === 14, "TRIAL_DAYS=14 인식");
  const pre = await getSubscriptionInfo({ id: 1, role: "user" }, db);
  ok(pre.status === "off", "테이블이 없으면(마이그레이션 전) 제한 없음");

  const sql = fs.readFileSync("drizzle/0006_smart_hairball.sql", "utf8");
  await pg.exec(sql.replace(/--> statement-breakpoint/g, ""));
  const first = await getSubscriptionInfo({ id: 1, role: "user" }, db);
  ok(first.status === "trial" && first.daysLeft === 14, "첫 이용 시 14일 체험 시작");
  const again = await getSubscriptionInfo({ id: 1, role: "user" }, db);
  ok(again.status === "trial" && again.until?.getTime() === first.until?.getTime(), "다시 조회해도 체험 종료일 불변");
  const par = await Promise.all([1, 2, 3, 4].map(() => getSubscriptionInfo({ id: 9, role: "user" }, db)));
  ok(par.every((p) => p.status === "trial") && new Set(par.map((p) => p.until?.getTime())).size === 1, "동시 첫 접속도 한 번만 생성");

  // 체험 강제 만료 후 → expired
  await pg.exec("update subscriptions set trial_ends_at = now() - interval '1 day' where user_id = 1");
  ok((await getSubscriptionInfo({ id: 1, role: "user" }, db)).status === "expired", "체험 종료 후 expired");
  ok((await getSubscriptionInfo({ id: 1, role: "admin" }, db)).status === "admin", "관리자는 만료와 무관");

  const until = await extendPaid(1, 30, db);
  const afterExtend = await getSubscriptionInfo({ id: 1, role: "user" }, db);
  ok(afterExtend.status === "paid" && afterExtend.daysLeft === 30, "30일 연장 → paid 30일");
  const until2 = await extendPaid(1, 30, db);
  ok(Math.round((until2.getTime() - until.getTime()) / DAY) === 30, "다시 연장하면 기존 만료일 뒤에 이어 붙음");
  await extendPaid(1, -3650, db);
  ok((await getSubscriptionInfo({ id: 1, role: "user" }, db)).status === "expired", "크게 줄이면 즉시 만료");

  process.env.TRIAL_DAYS = "0";
  ok((await getSubscriptionInfo({ id: 1, role: "user" }, db)).status === "off", "TRIAL_DAYS=0이면 전체 꺼짐");
  console.log(fails ? `FAIL ${fails}` : "ALL PASS");
  process.exit(fails ? 1 : 0);
}
main();
