import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_COOKIE = "session";
const JWT_ALG = "HS256";

function getSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "JWT_SECRET이 설정되지 않았거나 너무 짧습니다 (32자 이상 권장). " +
        "Vercel 환경변수에 openssl rand -base64 48 로 생성한 값을 넣으세요."
    );
  }
  return s;
}

export async function hashPassword(plain: string): Promise<string> {
  // cost factor 12: 보안과 응답속도의 합리적 절충점
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type SessionPayload = {
  uid: number;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected";
};

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { algorithm: JWT_ALG, expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret(), { algorithms: [JWT_ALG] }) as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = JWT_COOKIE;

// 비밀번호 최소 정책: 8자 이상, 영문+숫자 혼합. 완벽하진 않지만 합리적 하한선.
export function validatePasswordPolicy(pw: string): string | null {
  if (pw.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "비밀번호는 영문과 숫자를 포함해야 합니다.";
  return null;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function genReferralCode(): string {
  // 사람이 읽기 쉬운 8자 코드 (대문자+숫자, 혼동되는 0/O, 1/I 제외)
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
