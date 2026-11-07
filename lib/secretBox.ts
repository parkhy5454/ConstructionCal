// DB에 저장하는 민감값(2FA 비밀키)을 AES-256-GCM으로 암호화합니다. DB가 유출돼도 JWT_SECRET 없이는 복호화할 수 없습니다.
// 키는 JWT_SECRET에서 용도별로 파생(HKDF)하므로 세션 서명 키와 직접 같은 값을 쓰지 않습니다.
import crypto from "crypto";

function key(): Buffer {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET이 설정되지 않았거나 너무 짧습니다.");
  return Buffer.from(crypto.hkdfSync("sha256", s, "concal-salt-v1", "concal-totp-secret-v1", 32));
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(enc: string): string {
  const raw = Buffer.from(enc, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
