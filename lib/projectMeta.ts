// 견적서 부가 설정(할증/상태/거래처/메모). project_meta 테이블이 아직 없으면(마이그레이션 전) 기본값으로 동작합니다.
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { projectMeta } from "./schema";
import { isMissingTable, isMissingColumn } from "./security";

const isMissingSchema = (e: unknown) => isMissingTable(e) || isMissingColumn(e);
import type { Surcharge } from "./calc";

type Db = ReturnType<typeof getDb>;

export const PROJECT_STATUSES = ["draft", "submitted", "won", "lost"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const STATUS_LABELS: Record<ProjectStatus, string> = { draft: "작성 중", submitted: "제출", won: "수주", lost: "실주" };

export type Meta = { surcharges: Surcharge[]; status: ProjectStatus; clientId: number | null; memo: string; priceBasis: string };
export const DEFAULT_META: Meta = { surcharges: [], status: "draft", clientId: null, memo: "", priceBasis: "" };

// 입력 검증: 잘못된 항목은 에러 문자열을 돌려줍니다.
export function parseSurcharges(input: unknown): { ok: true; value: Surcharge[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "할증 목록 형식이 올바르지 않습니다." };
  if (input.length > 10) return { ok: false, error: "할증 항목은 최대 10개까지 가능합니다." };
  const out: Surcharge[] = [];
  for (const x of input) {
    const label = String(x?.label ?? "").trim();
    const percent = Number(x?.percent);
    const group = x?.group == null || x.group === "" ? null : String(x.group).trim().slice(0, 60);
    if (!label || label.length > 30) return { ok: false, error: "할증 이름은 1~30자로 입력하세요." };
    if (!isFinite(percent) || percent < -50 || percent > 300) return { ok: false, error: "할증률은 -50% ~ 300% 범위로 입력하세요." };
    out.push({ id: String(x?.id ?? "").slice(0, 20) || Math.random().toString(36).slice(2, 10), label, percent: Math.round(percent * 100) / 100, group });
  }
  return { ok: true, value: out };
}

function rowToMeta(r: typeof projectMeta.$inferSelect | undefined): Meta {
  if (!r) return { ...DEFAULT_META };
  let surcharges: Surcharge[] = [];
  try {
    const p = parseSurcharges(r.surcharges ? JSON.parse(r.surcharges) : []);
    if (p.ok) surcharges = p.value;
  } catch {}
  const status = (PROJECT_STATUSES as readonly string[]).includes(r.status) ? (r.status as ProjectStatus) : "draft";
  return { surcharges, status, clientId: r.clientId ?? null, memo: r.memo ?? "", priceBasis: r.priceBasis ?? "" };
}

export async function getMeta(projectId: number, db: Db = getDb()): Promise<Meta> {
  try {
    const rows = await db.select().from(projectMeta).where(eq(projectMeta.projectId, projectId)).limit(1);
    return rowToMeta(rows[0]);
  } catch (e) {
    if (isMissingSchema(e)) return { ...DEFAULT_META };
    throw e;
  }
}

export async function getMetaMap(projectIds: number[], db: Db = getDb()): Promise<Map<number, Meta>> {
  const map = new Map<number, Meta>();
  if (projectIds.length === 0) return map;
  try {
    const rows = await db.select().from(projectMeta).where(inArray(projectMeta.projectId, projectIds));
    for (const r of rows) map.set(r.projectId, rowToMeta(r));
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
  }
  return map;
}

export class MetaTableMissingError extends Error {
  constructor() { super("견적 설정용 DB 테이블이 아직 없습니다. 운영 DB에 `npm run db:push`를 실행하세요."); }
}

export async function saveMeta(projectId: number, patch: Partial<Meta>, db: Db = getDb()): Promise<Meta> {
  const cur = await getMeta(projectId, db);
  const next: Meta = { ...cur, ...patch };
  try {
    await db
      .insert(projectMeta)
      .values({ projectId, surcharges: JSON.stringify(next.surcharges), status: next.status, clientId: next.clientId, memo: next.memo, priceBasis: next.priceBasis || null })
      .onConflictDoUpdate({
        target: projectMeta.projectId,
        set: { surcharges: JSON.stringify(next.surcharges), status: next.status, clientId: next.clientId, memo: next.memo, priceBasis: next.priceBasis || null, updatedAt: new Date() },
      });
  } catch (e) {
    if (isMissingSchema(e)) throw new MetaTableMissingError();
    throw e;
  }
  return next;
}
