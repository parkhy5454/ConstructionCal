// TOTP(RFC 6238) 2단계 인증 — 외부 라이브러리 없이 Node crypto만 사용합니다.
// Google Authenticator / Microsoft Authenticator / Authy 등 표준 인증 앱과 호환(SHA-1, 6자리, 30초).
import crypto from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20)); // 160비트(RFC 권장)
}

export function hotp(secretBase32: string, counter: number, digits = TOTP_DIGITS): string {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

// 코드가 맞으면 "일치한 시간 구간(step)"을 돌려주고 틀리면 null.
// 시계 오차를 감안해 ±1구간(±30초)을 허용하며, lastUsedStep 이하 구간은 거부해 같은 코드의 재사용(재전송 공격)을 막습니다.
export function verifyTotp(secretBase32: string, code: string, lastUsedStep = 0, nowMs = Date.now()): number | null {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const cur = currentStep(nowMs);
  for (const delta of [0, -1, 1]) {
    const step = cur + delta;
    if (step <= lastUsedStep) continue;
    const expected = hotp(secretBase32, step);
    // 길이가 같은 문자열 비교이므로 timingSafeEqual 사용 가능
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}

export function otpauthUri(secretBase32: string, accountEmail: string, issuer = "ConCal"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

// ---------- 복구 코드 (인증 앱을 잃어버렸을 때 1회용으로 사용) ----------

export function generateRecoveryCodes(n = 8): string[] {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    let c = "";
    for (let j = 0; j < 10; j++) c += chars[crypto.randomInt(chars.length)];
    codes.push(`${c.slice(0, 5)}-${c.slice(5)}`);
  }
  return codes;
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}
