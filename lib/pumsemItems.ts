import { and, eq, sql, asc } from "drizzle-orm";
import { getDb } from "./db";
import { pumsemItems, laborRates, pumsem, materials } from "./schema";
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

/** 표준품셈 책 검색 — 공종·규격·장/절 이름·직종(내선전공 등)에 단어가 모두 들어 있는 항목(페이지 단위). 테이블이 아직 없으면 빈 결과. */
export async function searchPumsemItems(discipline: string, q: string, limit: number, offset: number, db: ReturnType<typeof getDb> = getDb()): Promise<{ rows: PumsemItem[]; total: number; missing?: boolean }> {
  const words = q.toLowerCase().replace(/[&,]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  const conds = [eq(pumsemItems.discipline, discipline as never)];
  for (const w of words) {
    conds.push(sql`lower(${pumsemItems.chapter} || ' ' || ${pumsemItems.section} || ' ' || ${pumsemItems.title} || ' ' || ${pumsemItems.spec} || ' ' || ${pumsemItems.labors}) like ${"%" + w.replace(/[%_\\]/g, "\\$&") + "%"}`);
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

export type RawPumsemRow = { code?: unknown; chapter?: unknown; section?: unknown; title?: unknown; spec?: unknown; unit?: unknown; page?: unknown; note?: unknown; review?: unknown; labors?: unknown };

/** 업로드된 JSON 한 줄을 pumsem_items 행으로 정리합니다. 직종 공수가 하나도 없는 줄은 건너뜁니다(null 반환). */
export function toPumsemRow(discipline: string, r: RawPumsemRow): typeof pumsemItems.$inferInsert | null {
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const labors = Array.isArray(r.labors) ? r.labors : [];
  const clean = labors
    .map((l: { name?: unknown; factor?: unknown }) => ({ name: String(l?.name ?? "").trim(), factor: Number(l?.factor) }))
    .filter((l: { name: string; factor: number }) => l.name && isFinite(l.factor) && l.factor >= 0);
  if (clean.length === 0) return null;
  return {
    discipline: discipline as never,
    code: s(r.code, 40), chapter: s(r.chapter, 160), section: s(r.section, 200),
    title: s(r.title, 300) || "(제목 없음)", spec: s(r.spec, 500), unit: s(r.unit, 40),
    page: Number.isInteger(r.page) ? (r.page as number) : null,
    note: s(r.note, 2000),
    review: Array.isArray(r.review) ? r.review.map(String).join("; ").slice(0, 2000) : s(r.review, 2000),
    labors: JSON.stringify(clean),
  };
}

/** 한 묶음(chunk)을 적재합니다. replace=true(첫 묶음)면 그 업종의 기존 항목을 먼저 지웁니다. */
export async function importPumsemRows(discipline: string, rows: RawPumsemRow[], replace: boolean, db: ReturnType<typeof getDb> = getDb()): Promise<{ inserted: number; skipped: number }> {
  if (replace) await db.delete(pumsemItems).where(eq(pumsemItems.discipline, discipline as never));
  const vals = rows.map((r) => toPumsemRow(discipline, r)).filter((v): v is NonNullable<typeof v> => v !== null);
  for (let i = 0; i < vals.length; i += 400) await db.insert(pumsemItems).values(vals.slice(i, i + 400));
  return { inserted: vals.length, skipped: rows.length - vals.length };
}

/** 표준품셈 항목을 그대로 내 품셈에 담기 위해, 같은 이름·규격·단위의 내 항목(자재, 분류 "표준품셈", 단가 0)을 찾거나 만듭니다. */
export async function ensureItemMaterial(userId: number, discipline: string, item: PumsemItem, db: ReturnType<typeof getDb> = getDb()): Promise<number> {
  const name = item.title.slice(0, 200);
  const spec = item.spec.slice(0, 200);
  const unit = (item.unit || "식").slice(0, 20);
  const ex = (await db.select({ id: materials.id }).from(materials)
    .where(and(eq(materials.userId, userId), eq(materials.discipline, discipline as never), eq(materials.name, name), eq(materials.spec, spec), eq(materials.unit, unit))).limit(1))[0];
  if (ex) return ex.id;
  const [row] = await db.insert(materials).values({ userId, discipline: discipline as never, category: "표준품셈", name, spec, unit, price: "0" }).returning({ id: materials.id });
  return row.id;
}
