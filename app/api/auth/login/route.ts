import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { verifyPassword, signSession, SESSION_COOKIE } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  // IP + 이메일 조합으로 무차별 대입 시도 제한
  if (!rateLimit(`login:${ip}:${email}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const genericError = () => NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });

  if (rows.length === 0) return genericError();
  const user = rows[0];

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return genericError();

  if (user.status === "pending") {
    return NextResponse.json({ error: "관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다." }, { status: 403 });
  }
  if (user.status === "rejected") {
    return NextResponse.json({ error: "가입이 승인되지 않았습니다. 관리자에게 문의하세요." }, { status: 403 });
  }

  const token = signSession({ uid: user.id, role: user.role, status: user.status });

  const res = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword === 1,
    },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7일
  });
  return res;
}
