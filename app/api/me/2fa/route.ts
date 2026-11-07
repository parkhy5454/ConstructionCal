import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/currentUser";
import { verifyPassword } from "@/lib/auth";
import { rateLimitAsync } from "@/lib/rateLimit";
import {
  getSecurity,
  stageTotpSecret,
  enableTotp,
  disableTotp,
  recoveryCodesRemaining,
  SecurityTablesMissingError,
} from "@/lib/security";
import { encryptSecret, decryptSecret } from "@/lib/secretBox";
import { generateTotpSecret, generateRecoveryCodes, hashRecoveryCode, otpauthUri, verifyTotp } from "@/lib/totp";
import { verifySecondFactor } from "@/lib/twoFactor";

export const runtime = "nodejs";

// 현재 2FA 상태
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const sec = await getSecurity(user.id);
  return NextResponse.json({
    enabled: sec?.totpEnabled === 1,
    recoveryCodesRemaining: sec?.totpEnabled === 1 ? recoveryCodesRemaining(sec) : 0,
  });
}

// 2FA 설정/활성화/해제. 세션을 훔친 사람이 2FA를 마음대로 켜서 주인을 잠그거나 꺼버리지 못하도록
// 설정과 해제에는 현재 비밀번호(해제는 추가로 인증 코드)를 요구합니다.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const action = String(body.action ?? "");

  if (!(await rateLimitAsync(`me2fa:${user.id}`, 15, 10 * 60_000))) {
    return NextResponse.json({ error: "시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  try {
    if (action === "setup") {
      if (!(await verifyPassword(String(body.currentPassword ?? ""), user.passwordHash))) {
        return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 401 });
      }
      const secret = generateTotpSecret();
      const staged = await stageTotpSecret(user.id, encryptSecret(secret));
      if (!staged) return NextResponse.json({ error: "이미 2단계 인증이 켜져 있습니다." }, { status: 409 });
      const uri = otpauthUri(secret, user.email);
      const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
      return NextResponse.json({ secret, uri, qr });
    }

    if (action === "enable") {
      const sec = await getSecurity(user.id);
      if (!sec?.totpSecretEnc || sec.totpEnabled === 1) {
        return NextResponse.json({ error: "먼저 2단계 인증 설정을 시작하세요." }, { status: 400 });
      }
      const step = verifyTotp(decryptSecret(sec.totpSecretEnc), String(body.code ?? ""), 0);
      if (step == null) return NextResponse.json({ error: "인증 코드가 올바르지 않습니다. 앱에 표시된 6자리를 입력하세요." }, { status: 400 });
      const codes = generateRecoveryCodes();
      await enableTotp(user.id, codes.map(hashRecoveryCode), step);
      // 복구 코드 원문은 지금 이 응답에서만 볼 수 있습니다(DB에는 해시만 저장).
      return NextResponse.json({ ok: true, recoveryCodes: codes });
    }

    if (action === "disable") {
      if (!(await verifyPassword(String(body.currentPassword ?? ""), user.passwordHash))) {
        return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 401 });
      }
      if (!(await verifySecondFactor(user.id, String(body.code ?? "").slice(0, 40)))) {
        return NextResponse.json({ error: "인증 코드(또는 복구 코드)가 올바르지 않습니다." }, { status: 401 });
      }
      await disableTotp(user.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e) {
    if (e instanceof SecurityTablesMissingError) {
      return NextResponse.json({ error: "2단계 인증을 쓰려면 운영 DB 마이그레이션(npm run db:push)이 먼저 필요합니다. 관리자에게 문의하세요." }, { status: 503 });
    }
    throw e;
  }
}
