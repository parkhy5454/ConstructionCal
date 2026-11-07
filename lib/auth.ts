import bcrypt from "bcryptjs";
import crypto from "crypto";
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
  // 발급 시점 비밀번호의 지문. 비밀번호가 바뀌면(본인 변경/관리자 재설정) 지문이 달라져 기존 세션이 모두 무효가 됩니다.
  // (이 기능 배포 이전에 발급된 토큰엔 pv가 없으며, 그 토큰은 최대 7일 뒤 자연 만료됩니다.)
  pv?: string;
};

export function passwordFingerprint(passwordHash: string): string {
  return crypto.createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

// 토큰이 현재 DB의 비밀번호 상태와 일치하는지 확인
export function sessionMatchesPassword(payload: SessionPayload, passwordHash: string): boolean {
  return payload.pv === undefined || payload.pv === passwordFingerprint(passwordHash);
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { algorithm: JWT_ALG, expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const p = jwt.verify(token, getSecret(), { algorithms: [JWT_ALG] }) as SessionPayload & { purpose?: string };
    // 같은 키로 서명된 다른 용도의 토큰(2FA 챌린지 등)이 로그인 세션으로 통용되지 않도록 차단
    if (p.purpose || typeof p.uid !== "number" || !p.role) return null;
    return p;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = JWT_COOKIE;

// 비밀번호까지 맞은 뒤 2FA 코드를 받는 짧은 단계용 토큰(5분). 세션이 아니므로 API 접근 권한이 전혀 없습니다.
export function signTwoFactorChallenge(uid: number): string {
  return jwt.sign({ uid, purpose: "2fa" }, getSecret(), { algorithm: JWT_ALG, expiresIn: "5m" });
}

export function verifyTwoFactorChallenge(token: string): number | null {
  try {
    const p = jwt.verify(token, getSecret(), { algorithms: [JWT_ALG] }) as { uid?: number; purpose?: string };
    return p.purpose === "2fa" && typeof p.uid === "number" ? p.uid : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 7 };
}

// 존재하지 않는 계정으로 로그인 시도할 때도 bcrypt 비교를 한 번 수행해 응답 시간 차이로 가입 여부를 알아내지 못하게 합니다.
export const DUMMY_PASSWORD_HASH = "$2a$12$yF.32qzrvuHGLC8cVTKpLO25UT8Tb4ZGWt0/WH1gi/9wAPjNiepLK";

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
