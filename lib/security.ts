// 이메일 인증 / 2단계 인증(2FA) 상태 저장·조회. 새 테이블(user_security, auth_tokens)만 사용합니다.
//
// 배포 안전성: 코드가 먼저 배포되고 마이그레이션(npm run db:push)이 아직 안 된 시점에도 기존 로그인이 깨지지 않도록,
// "테이블이 없음" 오류는 "이 기능을 쓰는 계정이 아직 없음"으로 취급합니다. 반면 그 밖의 DB 오류는 그대로 던져서,
// 일시 장애 때 2FA가 켜진 계정이 검사를 건너뛰고 로그인되는 일(fail-open)이 없게 합니다.
import crypto from "crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb } from "./db";
import { userSecurity, authTokens } from "./schema";

type Db = ReturnType<typeof getDb>;
export type UserSecurity = typeof userSecurity.$inferSelect;

export class SecurityTablesMissingError extends Error {
  constructor() {
    super("보안 기능용 DB 테이블이 아직 없습니다. 운영 DB에 `npm run db:push`를 실행하세요.");
  }
}

// Postgres 42P01 = undefined_table
export function isMissingTable(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string; cause?: unknown };
  if (err.code === "42P01") return true;
  if (typeof err.message === "string" && /relation ".*" does not exist/i.test(err.message)) return true;
  return err.cause ? isMissingTable(err.cause) : false;
}

// Postgres 42703 = undefined_column (코드가 먼저 배포되고 컬럼 추가 마이그레이션이 아직 안 된 경우)
export function isMissingColumn(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string; cause?: unknown };
  if (err.code === "42703") return true;
  if (typeof err.message === "string" && /column ".*" (of relation ".*" )?does not exist/i.test(err.message)) return true;
  return err.cause ? isMissingColumn(err.cause) : false;
}

export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// RESEND_API_KEY와 EMAIL_FROM이 모두 설정된 경우에만 이메일 인증을 강제합니다(메일을 못 보내는데 가입자를 막는 일 방지).
export function isEmailVerificationEnforced(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM && process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
}

// 행이 없거나 테이블이 없으면 null (= 기능을 쓰지 않는 기존 계정)
export async function getSecurity(userId: number, db: Db = getDb()): Promise<UserSecurity | null> {
  try {
    const rows = await db.select().from(userSecurity).where(eq(userSecurity.userId, userId)).limit(1);
    return rows[0] ?? null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

// 관리자 화면용: 전체 사용자의 보안 상태. 테이블이 없으면 빈 Map(= 아무도 기능을 쓰지 않음).
export async function listSecurity(db: Db = getDb()): Promise<Map<number, UserSecurity>> {
  try {
    const rows = await db.select().from(userSecurity);
    return new Map(rows.map((r) => [r.userId, r]));
  } catch (e) {
    if (isMissingTable(e)) return new Map();
    throw e;
  }
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isMissingTable(e)) throw new SecurityTablesMissingError();
    throw e;
  }
}

// ---------- 이메일 인증 ----------

export async function markEmailUnverified(userId: number, db: Db = getDb()) {
  return guard(async () => {
    await db
      .insert(userSecurity)
      .values({ userId, emailVerifiedAt: null })
      .onConflictDoUpdate({ target: userSecurity.userId, set: { emailVerifiedAt: null, updatedAt: new Date() } });
  });
}

export async function markEmailVerified(userId: number, db: Db = getDb()) {
  return guard(async () => {
    await db
      .insert(userSecurity)
      .values({ userId, emailVerifiedAt: new Date() })
      .onConflictDoUpdate({ target: userSecurity.userId, set: { emailVerifiedAt: new Date(), updatedAt: new Date() } });
  });
}

// 토큰 원문을 반환합니다(메일 링크에만 사용). DB에는 해시만 저장.
export async function createToken(userId: number, kind: string, ttlMs: number, db: Db = getDb()): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  await guard(async () => {
    // 같은 사용자의 이전 미사용 토큰은 무효화(재발송 시 오래된 링크 차단)
    await db
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)));
    await db.insert(authTokens).values({ userId, kind, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + ttlMs) });
  });
  return raw;
}

// 유효한 토큰이면 "사용됨"으로 표시하고 userId를 반환. UPDATE ... RETURNING 한 문장이라 같은 링크를 두 번 쓸 수 없습니다.
export async function consumeToken(kind: string, raw: string, db: Db = getDb()): Promise<number | null> {
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  const rows = await guard(() =>
    db
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authTokens.tokenHash, sha256Hex(raw)),
          eq(authTokens.kind, kind),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date())
        )
      )
      .returning({ userId: authTokens.userId })
  );
  return rows[0]?.userId ?? null;
}

// ---------- 2단계 인증(TOTP) ----------

// 설정 시작: 비밀키를 (아직 활성화하지 않은 채) 저장. 이미 활성화된 계정은 덮어쓰지 않습니다.
export async function stageTotpSecret(userId: number, secretEnc: string, db: Db = getDb()): Promise<boolean> {
  return guard(async () => {
    const existing = await db.select().from(userSecurity).where(eq(userSecurity.userId, userId)).limit(1);
    if (existing[0]?.totpEnabled === 1) return false;
    await db
      .insert(userSecurity)
      .values({ userId, totpSecretEnc: secretEnc, totpEnabled: 0, totpLastStep: 0 })
      .onConflictDoUpdate({
        target: userSecurity.userId,
        set: { totpSecretEnc: secretEnc, totpEnabled: 0, totpLastStep: 0, recoveryCodes: null, updatedAt: new Date() },
      });
    return true;
  });
}

export async function enableTotp(userId: number, recoveryHashes: string[], lastStep: number, db: Db = getDb()) {
  await guard(async () => {
    await db
      .update(userSecurity)
      .set({ totpEnabled: 1, totpLastStep: lastStep, recoveryCodes: JSON.stringify(recoveryHashes), updatedAt: new Date() })
      .where(eq(userSecurity.userId, userId));
  });
}

export async function disableTotp(userId: number, db: Db = getDb()) {
  await guard(async () => {
    await db
      .update(userSecurity)
      .set({ totpEnabled: 0, totpSecretEnc: null, totpLastStep: 0, recoveryCodes: null, updatedAt: new Date() })
      .where(eq(userSecurity.userId, userId));
  });
}

// 이 30초 구간을 "사용함"으로 기록. 이미 같거나 더 나중 구간이 기록돼 있으면 false —
// 같은 코드를 동시에 두 번 보내는 재전송 공격도 UPDATE의 조건 때문에 한쪽만 성공합니다.
export async function claimTotpStep(userId: number, step: number, db: Db = getDb()): Promise<boolean> {
  const rows = await guard(() =>
    db
      .update(userSecurity)
      .set({ totpLastStep: step })
      .where(and(eq(userSecurity.userId, userId), lt(userSecurity.totpLastStep, step)))
      .returning({ userId: userSecurity.userId })
  );
  return rows.length > 0;
}

// 복구 코드 1개 소진(1회용). 동시 사용을 막기 위해 "읽은 값과 같을 때만" 갱신합니다.
export async function consumeRecoveryCode(userId: number, codeHash: string, db: Db = getDb()): Promise<boolean> {
  const sec = await getSecurity(userId, db);
  if (!sec?.recoveryCodes) return false;
  let hashes: string[];
  try {
    hashes = JSON.parse(sec.recoveryCodes) as string[];
  } catch {
    return false;
  }
  const idx = hashes.findIndex((h) => h.length === codeHash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(codeHash)));
  if (idx === -1) return false;
  const next = hashes.filter((_, i) => i !== idx);
  const rows = await guard(() =>
    db
      .update(userSecurity)
      .set({ recoveryCodes: JSON.stringify(next), updatedAt: new Date() })
      .where(and(eq(userSecurity.userId, userId), eq(userSecurity.recoveryCodes, sec.recoveryCodes as string)))
      .returning({ userId: userSecurity.userId })
  );
  return rows.length > 0;
}

export function recoveryCodesRemaining(sec: UserSecurity | null): number {
  if (!sec?.recoveryCodes) return 0;
  try {
    return (JSON.parse(sec.recoveryCodes) as string[]).length;
  } catch {
    return 0;
  }
}
