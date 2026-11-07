// 견적서 읽기 전용 공유 링크. 토큰 원문은 생성 직후 한 번만 보여주고 DB에는 SHA-256 해시만 둡니다.
import crypto from "crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { shareLinks, projects, users } from "./schema";
import { isMissingTable } from "./security";

type Db = ReturnType<typeof getDb>;

export const SHARE_MAX_DAYS = 90;
export const SHARE_MAX_ACTIVE = 20;

export function newShareToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(24).toString("base64url"); // 192비트
  return { token, hash: hashToken(token) };
}
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
export function validTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}

export class ShareTableMissingError extends Error {
  constructor() { super("공유 링크 테이블이 아직 없습니다. 운영 DB에 `npm run db:push`를 실행하세요."); }
}

export async function createShareLink(userId: number, projectId: number, days: number, db: Db = getDb()) {
  const d = Math.min(Math.max(Math.floor(days), 1), SHARE_MAX_DAYS);
  const { token, hash } = newShareToken();
  try {
    const active = await db.select({ id: shareLinks.id }).from(shareLinks)
      .where(and(eq(shareLinks.projectId, projectId), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, new Date())));
    if (active.length >= SHARE_MAX_ACTIVE) throw new Error(`활성 공유 링크는 견적서당 최대 ${SHARE_MAX_ACTIVE}개까지입니다.`);
    const expiresAt = new Date(Date.now() + d * 86400_000);
    const [row] = await db.insert(shareLinks).values({ projectId, userId, tokenHash: hash, expiresAt }).returning();
    return { token, id: row.id, expiresAt };
  } catch (e) {
    if (isMissingTable(e)) throw new ShareTableMissingError();
    throw e;
  }
}

export async function listShareLinks(projectId: number, db: Db = getDb()) {
  try {
    return await db.select({
      id: shareLinks.id, expiresAt: shareLinks.expiresAt, revokedAt: shareLinks.revokedAt,
      viewCount: shareLinks.viewCount, lastViewedAt: shareLinks.lastViewedAt, createdAt: shareLinks.createdAt,
    }).from(shareLinks).where(eq(shareLinks.projectId, projectId)).orderBy(sql`${shareLinks.id} desc`).limit(50);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function revokeShareLink(projectId: number, linkId: number, db: Db = getDb()): Promise<boolean> {
  try {
    const rows = await db.update(shareLinks).set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.id, linkId), eq(shareLinks.projectId, projectId), isNull(shareLinks.revokedAt))).returning({ id: shareLinks.id });
    return rows.length > 0;
  } catch (e) {
    if (isMissingTable(e)) return false;
    throw e;
  }
}

// 공개 페이지용: 유효한 링크면 프로젝트와 소유자(승인 상태)까지 확인해 돌려주고 조회수를 올립니다. 아니면 null.
export async function resolveShare(token: string, db: Db = getDb()) {
  if (!validTokenShape(token)) return null;
  try {
    const rows = await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, hashToken(token))).limit(1);
    const link = rows[0];
    if (!link || link.revokedAt || link.expiresAt.getTime() <= Date.now()) return null;
    const proj = await db.select().from(projects).where(eq(projects.id, link.projectId)).limit(1);
    if (!proj[0] || proj[0].userId !== link.userId) return null;
    const owner = await db.select({ status: users.status, name: users.name }).from(users).where(eq(users.id, link.userId)).limit(1);
    if (!owner[0] || owner[0].status !== "approved") return null;
    await db.update(shareLinks).set({ viewCount: sql`${shareLinks.viewCount} + 1`, lastViewedAt: new Date() }).where(eq(shareLinks.id, link.id));
    return { link, project: proj[0], ownerName: owner[0].name };
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}
