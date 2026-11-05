import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { hashPassword, validateEmail, validatePasswordPolicy, genReferralCode } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const referredBy = body.referralCode ? String(body.referralCode).trim().toUpperCase() : null;

  if (!name || name.length > 80) {
    return NextResponse.json({ error: "이름을 올바르게 입력하세요." }, { status: 400 });
  }
  if (!validateEmail(email)) {
    return NextResponse.json({ error: "이메일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const pwErr = validatePasswordPolicy(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const db = getDb();

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "이미 가입된 이메일입니다." }, { status: 409 });
  }

  // 추천인 코드 유효성 확인 (있으면)
  if (referredBy) {
    const ref = await db.select().from(users).where(eq(users.referralCode, referredBy)).limit(1);
    if (ref.length === 0) {
      return NextResponse.json({ error: "유효하지 않은 추천인 코드입니다." }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(password);

  // referral_code 유일성 보장 (극히 드문 충돌 대비 재시도)
  let myCode = genReferralCode();
  for (let i = 0; i < 5; i++) {
    const dup = await db.select().from(users).where(eq(users.referralCode, myCode)).limit(1);
    if (dup.length === 0) break;
    myCode = genReferralCode();
  }

  await db.insert(users).values({
    name,
    email,
    passwordHash,
    role: "user",
    status: "pending", // 관리자 승인 전까지 로그인 불가
    referralCode: myCode,
    referredBy,
  });

  return NextResponse.json(
    { message: "가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다." },
    { status: 201 }
  );
}
