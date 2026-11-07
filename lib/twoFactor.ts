// 로그인 2단계와 2FA 해제 때 공통으로 쓰는 "두 번째 인증요소 검증": 인증 앱 6자리 코드 또는 복구 코드(1회용).
import { getDb } from "./db";
import { claimTotpStep, consumeRecoveryCode, getSecurity } from "./security";
import { decryptSecret } from "./secretBox";
import { hashRecoveryCode, normalizeRecoveryCode, verifyTotp } from "./totp";

type Db = ReturnType<typeof getDb>;

export async function verifySecondFactor(userId: number, input: string, db: Db = getDb()): Promise<boolean> {
  const sec = await getSecurity(userId, db);
  if (!sec || sec.totpEnabled !== 1 || !sec.totpSecretEnc) return false;

  const trimmed = String(input ?? "").trim();
  if (/^\d{6}$/.test(trimmed.replace(/\s+/g, ""))) {
    const step = verifyTotp(decryptSecret(sec.totpSecretEnc), trimmed, sec.totpLastStep);
    if (step == null) return false;
    return claimTotpStep(userId, step, db);
  }
  if (normalizeRecoveryCode(trimmed).length === 10) {
    return consumeRecoveryCode(userId, hashRecoveryCode(trimmed), db);
  }
  return false;
}
