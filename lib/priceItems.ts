import { and, eq, sql, asc } from "drizzle-orm";
import { getDb } from "./db";
import { priceItems, materials } from "./schema";
import { isMissingTable } from "./security";

export type PriceItem = { id: number; category: string; name: string; spec: string; unit: string; price: number; maker: string; basis: string };
export type RawPriceRow = { category?: unknown; name?: unknown; spec?: unknown; unit?: unknown; price?: unknown; maker?: unknown };

const num = (v: string | number | null | undefined): number => (v == null ? 0 : typeof v === "number" ? v : parseFloat(v));

/** 공용 단가표 검색 — 분류·품명·규격·제조사에 입력한 단어가 모두 들어 있는 항목(쪽 단위). 테이블이 아직 없으면 빈 결과. */
export async function searchPriceItems(discipline: string, q: string, limit: number, offset: number, db: ReturnType<typeof getDb> = getDb()): Promise<{ rows: PriceItem[]; total: number; missing?: boolean }> {
  const words = q.toLowerCase().replace(/[&,]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  const conds = [eq(priceItems.discipline, discipline as never)];
  for (const w of words) {
    conds.push(sql`lower(${priceItems.category} || ' ' || ${priceItems.name} || ' ' || ${priceItems.spec} || ' ' || ${priceItems.maker}) like ${"%" + w.replace(/[%_\\]/g, "\\$&") + "%"}`);
  }
  const where = and(...conds);
  try {
    const rows = await db.select().from(priceItems).where(where).orderBy(asc(priceItems.id)).limit(limit).offset(offset);
    const cnt = await db.select({ n: sql<number>`count(*)::int` }).from(priceItems).where(where);
    return { rows: rows.map((r) => ({ id: r.id, category: r.category, name: r.name, spec: r.spec, unit: r.unit, price: num(r.price), maker: r.maker, basis: r.basis })), total: cnt[0]?.n ?? 0 };
  } catch (e) {
    if (isMissingTable(e)) return { rows: [], total: 0, missing: true };
    throw e;
  }
}

export function toPriceRow(discipline: string, basis: string, r: RawPriceRow): typeof priceItems.$inferInsert | null {
  const s = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const price = Number(String(r.price ?? "").replace(/[,\s]/g, ""));
  const name = s(r.name, 300);
  if (!name || !isFinite(price) || price < 0) return null;
  return { discipline: discipline as never, category: s(r.category, 160), name, spec: s(r.spec, 500), unit: s(r.unit, 40), price: String(price), maker: s(r.maker, 100), basis: s(basis, 60) };
}

/** 한 묶음을 적재합니다. replace=true(첫 묶음)면 그 업종의 기존 단가표를 먼저 비웁니다. */
export async function importPriceRows(discipline: string, basis: string, rows: RawPriceRow[], replace: boolean, db: ReturnType<typeof getDb> = getDb()): Promise<{ inserted: number; skipped: number }> {
  if (replace) await db.delete(priceItems).where(eq(priceItems.discipline, discipline as never));
  const vals = rows.map((r) => toPriceRow(discipline, basis, r)).filter((v): v is NonNullable<typeof v> => v !== null);
  for (let i = 0; i < vals.length; i += 500) await db.insert(priceItems).values(vals.slice(i, i + 500));
  return { inserted: vals.length, skipped: rows.length - vals.length };
}

export type AdoptedMaterial = { id: number; category: string; name: string; spec: string; unit: string; price: number; created: boolean };

/**
 * 공용 단가표 항목을 사용자의 자재로 담습니다. 같은 품명·규격(제조사는 " [제조사]"로 규격 뒤에 붙임)·단위가 이미 있으면 단가만 갱신하고, 없으면 새로 만듭니다.
 */
export async function adoptPriceItem(userId: number, discipline: string, itemId: number, db: ReturnType<typeof getDb> = getDb()): Promise<AdoptedMaterial | null> {
  const it = (await db.select().from(priceItems).where(and(eq(priceItems.id, itemId), eq(priceItems.discipline, discipline as never))).limit(1))[0];
  if (!it) return null;
  const name = it.name.slice(0, 200);
  const spec = (it.maker ? `${it.spec} [${it.maker}]` : it.spec).trim().slice(0, 200);
  const unit = (it.unit || "식").slice(0, 20);
  const category = it.category.slice(0, 40);
  const ex = (await db.select().from(materials).where(and(eq(materials.userId, userId), eq(materials.discipline, discipline as never), eq(materials.name, name), eq(materials.spec, spec), eq(materials.unit, unit))).limit(1))[0];
  if (ex) {
    await db.update(materials).set({ price: it.price, updatedAt: new Date() }).where(eq(materials.id, ex.id));
    return { id: ex.id, category: ex.category, name, spec, unit, price: num(it.price), created: false };
  }
  const [row] = await db.insert(materials).values({ userId, discipline: discipline as never, category, name, spec, unit, price: it.price }).returning();
  return { id: row.id, category, name, spec, unit, price: num(it.price), created: true };
}
