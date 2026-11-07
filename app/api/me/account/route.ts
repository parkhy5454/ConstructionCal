import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { getSecurity } from "@/lib/security";
import { verifySecondFactor } from "@/lib/twoFactor";
import { rateLimitAsync } from "@/lib/rateLimit";
import { deleteUserAccount, LastAdminError } from "@/lib/account";

export const runtime = "nodejs";

// 회원 탈퇴: 현재 비밀번호(+2단계 인증 사용 중이면 코드) 확인 후 계정과 모든 데이터를 삭제합니다. 되돌릴 수 없습니다.
// 구독 만료 상태에서도 탈퇴할 수 있어야 하므로 구독 가드를 적용하지 않습니다.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!(await rateLimitAsync(`delacct:${user.id}`, 5, 10 * 60_000))) {
    return NextResponse.json({ error: "시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const password = String(body?.password ?? "");
  if (!password || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 403 });
  }
  const sec = await getSecurity(user.id);
  if (sec?.totpEnabled === 1) {
    const ok = await verifySecondFactor(user.id, String(body?.code ?? "").slice(0, 40));
    if (!ok) return NextResponse.json({ error: "2단계 인증 코드가 올바르지 않습니다.", needs2fa: true }, { status: 403 });
  }
  try {
    await deleteUserAccount(user.id);
  } catch (e) {
    if (e instanceof LastAdminError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
