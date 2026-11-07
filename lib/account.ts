// 회원 탈퇴(개인정보 삭제)와 내 데이터 내보내기.
// 삭제는 neon-http 드라이버에 다중 문장 트랜잭션이 없어 순서대로 실행하며, 사용자 행은 맨 마지막에 지웁니다.
// 중간에 실패해도 사용자 행이 남아 있으므로 다시 시도하면 이어서 지워집니다(모든 삭제가 멱등).
import { eq, inArray, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  users, materials, laborRates, pumsem, rateSettings, dxfMappings, projects, bomItems, projectMeta, projectVersions,
  shareLinks, clients, userSecurity, authTokens, activeSessions, subscriptions, noticeLog, loginEvents, inquiries,
} from "./schema";
import { isMissingTable, isMissingColumn } from "./security";

type Db = ReturnType<typeof getDb>;

async function tolerant<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isMissingTable(e) || isMissingColumn(e)) return fallback;
    throw e;
  }
}

export class LastAdminError extends Error {
  constructor() { super("마지막 관리자 계정은 탈퇴할 수 없습니다. 다른 관리자를 먼저 지정하세요."); }
}

export async function deleteUserAccount(userId: number, db: Db = getDb()): Promise<void> {
  const me = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!me) return;
  if (me.role === "admin") {
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "approved")));
    if (admins.filter((a) => a.id !== userId).length === 0) throw new LastAdminError();
  }

  const projectIds = (await db.select({ id: projects.id }).from(projects).where(eq(projects.userId, userId))).map((p) => p.id);
  if (projectIds.length > 0) {
    await db.delete(bomItems).where(inArray(bomItems.projectId, projectIds));
    await tolerant(() => db.delete(projectMeta).where(inArray(projectMeta.projectId, projectIds)), undefined);
    await tolerant(() => db.delete(projectVersions).where(inArray(projectVersions.projectId, projectIds)), undefined);
    await tolerant(() => db.delete(shareLinks).where(inArray(shareLinks.projectId, projectIds)), undefined);
  }
  await tolerant(() => db.delete(shareLinks).where(eq(shareLinks.userId, userId)), undefined);
  await tolerant(() => db.delete(projectVersions).where(eq(projectVersions.userId, userId)), undefined);
  await db.delete(projects).where(eq(projects.userId, userId));
  await db.delete(pumsem).where(eq(pumsem.userId, userId));
  await db.delete(dxfMappings).where(eq(dxfMappings.userId, userId));
  await db.delete(materials).where(eq(materials.userId, userId));
  await db.delete(laborRates).where(eq(laborRates.userId, userId));
  await db.delete(rateSettings).where(eq(rateSettings.userId, userId));
  await tolerant(() => db.delete(clients).where(eq(clients.userId, userId)), undefined);
  await tolerant(() => db.delete(userSecurity).where(eq(userSecurity.userId, userId)), undefined);
  await tolerant(() => db.delete(authTokens).where(eq(authTokens.userId, userId)), undefined);
  await tolerant(() => db.delete(activeSessions).where(eq(activeSessions.userId, userId)), undefined);
  await tolerant(() => db.delete(subscriptions).where(eq(subscriptions.userId, userId)), undefined);
  await tolerant(() => db.delete(noticeLog).where(eq(noticeLog.userId, userId)), undefined);
  await tolerant(() => db.delete(loginEvents).where(eq(loginEvents.userId, userId)), undefined);
  await tolerant(() => db.delete(inquiries).where(eq(inquiries.userId, userId)), undefined);
  // admin_actions(관리자 조치 이력)는 책임 추적을 위해 남깁니다(개인정보 없음: 사용자 ID와 조치 종류만).
  await db.delete(users).where(eq(users.id, userId));
}

function omit<T extends object, K extends keyof T>(o: T, key: K): Omit<T, K> {
  const copy = { ...o };
  delete copy[key];
  return copy;
}

// 내 데이터 전체(JSON). 비밀번호 해시·2FA 비밀키·토큰 등 보안 정보는 포함하지 않습니다.
export async function exportUserData(userId: number, db: Db = getDb()) {
  const me = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!me) return null;
  const [mats, labor, pum, rates, projs, maps, cl] = await Promise.all([
    db.select().from(materials).where(eq(materials.userId, userId)),
    db.select().from(laborRates).where(eq(laborRates.userId, userId)),
    db.select().from(pumsem).where(eq(pumsem.userId, userId)),
    db.select().from(rateSettings).where(eq(rateSettings.userId, userId)),
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(dxfMappings).where(eq(dxfMappings.userId, userId)),
    tolerant(() => db.select().from(clients).where(eq(clients.userId, userId)), [] as (typeof clients.$inferSelect)[]),
  ]);
  const ids = projs.map((p) => p.id);
  const boms = ids.length ? await db.select().from(bomItems).where(inArray(bomItems.projectId, ids)) : [];
  const metas = ids.length ? await tolerant(() => db.select().from(projectMeta).where(inArray(projectMeta.projectId, ids)), [] as (typeof projectMeta.$inferSelect)[]) : [];
  const metaBy = new Map(metas.map((m) => [m.projectId, m]));
  return {
    exportedAt: new Date().toISOString(),
    account: { name: me.name, email: me.email, createdAt: me.createdAt },
    materials: mats.map((m) => omit(m, "userId")),
    laborRates: labor.map((m) => omit(m, "userId")),
    pumsem: pum.map((m) => omit(m, "userId")),
    rateSettings: rates.map((m) => omit(m, "userId")),
    clients: cl.map((m) => omit(m, "userId")),
    dxfMappings: maps.map((m) => omit(m, "userId")),
    projects: projs.map((p) => ({
      id: p.id, name: p.name, discipline: p.discipline, createdAt: p.createdAt, updatedAt: p.updatedAt,
      meta: metaBy.get(p.id) ? omit(metaBy.get(p.id)!, "projectId") : null,
      bom: boms.filter((b) => b.projectId === p.id).map((b) => omit(b, "projectId")),
    })),
  };
}
