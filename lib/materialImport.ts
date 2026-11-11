// 자재 단가 일괄 등록: 물가정보 등에서 정리한 표(TSV/CSV/엑셀)를 자재 DB에 한 번에 넣습니다.
// 같은 품명·규격·단위가 이미 있으면 단가만 갱신하고, 없으면 새 자재로 추가합니다. 제조사별 단가는 규격 뒤에 [제조사]를 붙여 별도 자재로 둡니다.
import { and, eq, sql } from "drizzle-orm";
import { materials } from "./schema";
import { matchKey, normUnit, normText } from "./excelMatch";

export type ImportRow = { category: string; name: string; spec: string; unit: string; price: number; maker: string };
export type ParseResult = { rows: ImportRow[]; skipped: number; warnings: string[] };

const HEAD: Record<keyof ImportRow, RegExp> = {
  category: /^(분류|구분|대분류|category)$/i,
  name: /^(품명|품목|자재명|name)$/i,
  spec: /^(규격|사양|spec)$/i,
  unit: /^(단위|unit)$/i,
  price: /^(단가|가격|금액|price)$/i,
  maker: /^(제조사|메이커|maker)$/i,
};

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const toPrice = (s: unknown): number | null => {
  const t = String(s ?? "").replace(/[,\s원₩]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return isFinite(n) && n >= 0 ? n : null;
};

// 첫 줄(머리글)을 보고 열을 찾습니다. 머리글이 없으면 [분류, 품명, 규격, 단위, 단가, 제조사] 순서로 가정합니다.
export function rowsFromTable(table: string[][]): ParseResult {
  const warnings: string[] = [];
  if (table.length === 0) return { rows: [], skipped: 0, warnings: ["내용이 비어 있습니다."] };
  let idx: Partial<Record<keyof ImportRow, number>> = {};
  const first = table[0].map(clean);
  first.forEach((h, i) => { (Object.keys(HEAD) as Array<keyof ImportRow>).forEach((k) => { if (idx[k] === undefined && HEAD[k].test(h)) idx[k] = i; }); });
  let start = 1;
  if (idx.name === undefined || idx.price === undefined) {
    idx = { category: 0, name: 1, spec: 2, unit: 3, price: 4, maker: 5 };
    start = 0;
    warnings.push("머리글을 찾지 못해 [분류, 품명, 규격, 단위, 단가, 제조사] 순서로 읽었습니다.");
  }
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (let r = start; r < table.length; r++) {
    const c = table[r];
    const get = (k: keyof ImportRow) => (idx[k] === undefined ? "" : clean(c[idx[k] as number]));
    const name = get("name"), unit = get("unit"), price = toPrice(c[idx.price as number]);
    if (!name || !unit || price === null) { if (c.some((x) => clean(x))) skipped++; continue; }
    rows.push({ category: get("category"), name, spec: get("spec"), unit, price, maker: get("maker") });
  }
  return { rows, skipped, warnings };
}

// TSV 또는 CSV 텍스트(UTF-8, BOM 허용)를 표로 나눕니다. 탭이 있으면 탭, 없으면 쉼표 구분(따옴표 처리 포함).
export function parseDelimited(text: string): string[][] {
  const t = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = t.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  if (lines.slice(0, 5).some((l) => l.includes("\t"))) return lines.map((l) => l.split("\t"));
  return lines.map((l) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

export const finalName = (r: ImportRow) => r.name.slice(0, 200);
export const finalSpec = (r: ImportRow) => (r.maker ? `${r.spec} [${r.maker}]` : r.spec).trim().slice(0, 200);
const keyOf = (name: string, spec: string, unit: string) => `${matchKey(name, spec)}|${normUnit(unit)}`;

export type ExistingMat = { id: number; name: string; spec: string; unit: string; price: number };
export type ImportPlan = {
  inserts: Array<{ category: string; name: string; spec: string; unit: string; price: number }>;
  updates: Array<{ id: number; price: number }>;
  unchanged: number;
  duplicatesInFile: number;
};

export function planImport(rows: ImportRow[], existing: ExistingMat[]): ImportPlan {
  const map = new Map<string, ExistingMat>();
  for (const m of existing) map.set(keyOf(m.name, m.spec, m.unit), m);
  const seen = new Set<string>();
  const plan: ImportPlan = { inserts: [], updates: [], unchanged: 0, duplicatesInFile: 0 };
  for (const r of rows) {
    const name = finalName(r), spec = finalSpec(r);
    const k = keyOf(name, spec, r.unit);
    if (seen.has(k)) { plan.duplicatesInFile++; continue; }
    seen.add(k);
    const ex = map.get(k);
    if (!ex) plan.inserts.push({ category: r.category.slice(0, 40), name, spec, unit: r.unit.slice(0, 20), price: r.price });
    else if (Math.abs(ex.price - r.price) > 0.0001) plan.updates.push({ id: ex.id, price: r.price });
    else plan.unchanged++;
  }
  return plan;
}

// 계획을 DB에 반영합니다(neon-http는 트랜잭션이 없어 여러 묶음으로 나눠 실행). db는 drizzle 인스턴스(테스트에서는 pglite).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyImport(db: any, userId: number, discipline: string, plan: ImportPlan, onProgress?: (done: number, total: number) => void) {
  const total = plan.inserts.length + plan.updates.length;
  let done = 0;
  for (let i = 0; i < plan.inserts.length; i += 500) {
    const chunk = plan.inserts.slice(i, i + 500);
    await db.insert(materials).values(chunk.map((m) => ({ userId, discipline, category: m.category, name: m.name, spec: m.spec, unit: m.unit, price: String(m.price) })));
    done += chunk.length; onProgress?.(done, total);
  }
  for (let i = 0; i < plan.updates.length; i += 500) {
    const chunk = plan.updates.slice(i, i + 500);
    const values = sql.join(chunk.map((u) => sql`(${u.id}, ${String(u.price)})`), sql`, `);
    await db.execute(sql`UPDATE materials AS m SET price = v.price::numeric, updated_at = now() FROM (VALUES ${values}) AS v(id, price) WHERE m.id = v.id::int AND m.user_id = ${userId}`);
    done += chunk.length; onProgress?.(done, total);
  }
  return { inserted: plan.inserts.length, updated: plan.updates.length };
}

export async function loadExisting(db: any, userId: number, discipline: string): Promise<ExistingMat[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows = await db.select({ id: materials.id, name: materials.name, spec: materials.spec, unit: materials.unit, price: materials.price })
    .from(materials).where(and(eq(materials.userId, userId), eq(materials.discipline, discipline as "electrical")));
  return rows.map((r: { id: number; name: string; spec: string; unit: string; price: string }) => ({ ...r, price: parseFloat(r.price) }));
}
export { normText };
