import { and, eq, sql, asc } from "drizzle-orm";
import { getDb } from "./db";
import { pumsemItems, laborRates, pumsem } from "./schema";
import { isMissingTable } from "./security";

export type PumsemLabor = { name: string; factor: number };
export type PumsemItem = {
  id: number; discipline: string; code: string; chapter: string; section: string; title: string;
  spec: string; unit: string; page: number | null; note: string; review: string; labors: PumsemLabor[];
};

export function parseLabors(s: string): PumsemLabor[] {
  try {
    const a = JSON.parse(s);
    if (!Array.isArray(a)) return [];
    return a
      .map((x) => ({ name: String(x?.name ?? "").trim(), factor: Number(x?.factor) }))
      .filter((x) => x.name && isFinite(x.factor) && x.factor >= 0);
  } catch { return []; }
}

const toItem = (r: typeof pumsemItems.$inferSelect): PumsemItem => ({ ...r, labors: parseLabors(r.labors) });

/** 표준품셈 책 검색 — 공종·규격·장/절 이름에 단어가 모두 들어 있는 항목(페이지 단위). 테이블이 아직 없으면 빈 결과. */
export async function searchPumsemItems(discipline: string, q: string, limit: number, offset: number, db: ReturnType<typeof getDb> = getDb()): Promise<{ rows: PumsemItem[]; total: number; missing?: boolean }> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const conds = [eq(pumsemItems.discipline, discipline as never)];
  for (const w of words) {
    conds.push(sql`lower(${pumsemItems.chapter} || ' ' || ${pumsemItems.section} || ' ' || ${pumsemItems.title} || ' ' || ${pumsemItems.spec}) like ${"%" + w.replace(/[%_\\]/g, "\\$&") + "%"}`);
  }
  const where = and(...conds);
  try {
    const rows = await db.select().from(pumsemItems).where(where).orderBy(asc(pumsemItems.id)).limit(limit).offset(offset);
    const cnt = await db.select({ n: sql<number>`count(*)::int` }).from(pumsemItems).where(where);
    return { rows: rows.map((r: typeof pumsemItems.$inferSelect) => toItem(r)), total: cnt[0]?.n ?? 0 };
  } catch (e) {
    if (isMissingTable(e)) return { rows: [], total: 0, missing: true };
    throw e;
  }
}

export async function getPumsemItem(id: number): Promise<PumsemItem | null> {
  try {
    const r = (await getDb().select().from(pumsemItems).where(eq(pumsemItems.id, id)).limit(1))[0];
    return r ? toItem(r) : null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

export type ApplyResult = { applied: Array<{ name: string; code: string; factor: number }>; createdLabor: string[] };

/**
 * 품셈 항목의 직종별 공수를 사용자의 자재(materialId)에 복사합니다. 이미 있는 (자재, 직종)은 공수를 덮어쓰고(replace=true일 때만 기존 다른 직종 삭제),
 * 직종 이름이 사용자 노임표에 없으면 노임단가 0원으로 새로 만들어 사용자가 단가를 채우게 합니다.
 */
export async function applyPumsemItem(userId: number, discipline: string, materialId: number, item: PumsemItem, replace: boolean, db: ReturnType<typeof getDb> = getDb()): Promise<ApplyResult> {
  const rates = await db.select().from(laborRates).where(and(eq(laborRates.userId, userId), eq(laborRates.discipline, discipline as never)));
  const byName = new Map<string, string>(rates.map((r: typeof laborRates.$inferSelect) => [r.name.replace(/\s+/g, ""), r.code]));
  const usedCodes = new Set(rates.map((r: typeof laborRates.$inferSelect) => r.code));
  const createdLabor: string[] = [];
  const applied: ApplyResult["applied"] = [];
  const merged = new Map<string, number>(); // 같은 직종이 두 번 나오면 합산
  for (const l of item.labors) merged.set(l.name, (merged.get(l.name) ?? 0) + l.factor);
  for (const [name, factor] of Array.from(merged.entries())) {
    const key = name.replace(/\s+/g, "");
    let code: string | undefined = byName.get(key);
    if (!code) {
      let n = 1;
      code = `P${String(n).padStart(2, "0")}`;
      while (usedCodes.has(code)) code = `P${String(++n).padStart(2, "0")}`;
      await db.insert(laborRates).values({ userId, discipline: discipline as never, code, name: name.slice(0, 60), rate: "0" }).onConflictDoNothing();
      usedCodes.add(code); byName.set(key, code); createdLabor.push(name);
    }
    applied.push({ name, code, factor });
  }
  if (replace) await db.delete(pumsem).where(and(eq(pumsem.userId, userId), eq(pumsem.materialId, materialId)));
  for (const a of applied) {
    await db.insert(pumsem).values({ userId, materialId, laborCode: a.code, factor: String(a.factor) })
      .onConflictDoUpdate({ target: [pumsem.userId, pumsem.materialId, pumsem.laborCode], set: { factor: String(a.factor) } });
  }
  return { applied, createdLabor };
}
