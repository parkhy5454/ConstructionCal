import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { pumsemItems } from "./schema";
import { isMissingTable } from "./security";
import { parseLabors, type PumsemItem } from "./pumsemItems";

export type Suggestion = { item: PumsemItem; score: number; confident: boolean };

const STOP = new Set(["및", "용", "기타", "일반", "형", "type", "mm", "㎜", "kv", "kw"]);

/** 품명에서 검색에 쓸 낱말(2자 이상)을 뽑습니다. 괄호는 공백 취급. */
export function nameTokens(name: string): string[] {
  return Array.from(new Set(name.toLowerCase().split(/[^0-9a-z가-힣]+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !STOP.has(w)))).slice(0, 5);
}
export function numberTokens(spec: string): string[] {
  return Array.from(new Set(spec.match(/\d+(?:\.\d+)?/g) ?? [])).slice(0, 6);
}

const hasNum = (hay: string, n: string) => new RegExp(`(^|[^0-9.])${n.replace(".", "\\.")}([^0-9.]|$)`).test(hay);

/** 자재 이름·규격과 표준품셈 책 항목의 일치도 점수. 이름 낱말이 하나도 맞지 않으면 0. */
export function scoreItem(nameT: string[], numT: string[], it: { chapter: string; section: string; title: string; spec: string }): number {
  const title = it.title.toLowerCase(), ctx = `${it.chapter} ${it.section}`.toLowerCase();
  let s = 0, nameHit = 0;
  for (const w of nameT) {
    if (title.includes(w)) { s += 3; nameHit++; } else if (ctx.includes(w)) { s += 1; nameHit++; }
  }
  if (nameHit === 0) return 0;
  const hay = `${it.title} ${it.spec}`;
  for (const n of numT) if (hasNum(hay, n)) s += 2;
  return s;
}

export async function suggestPumsem(discipline: string, name: string, spec: string, limit = 3, db: ReturnType<typeof getDb> = getDb()): Promise<Suggestion[]> {
  const nameT = nameTokens(name), numT = numberTokens(spec);
  if (nameT.length === 0) return [];
  const likes = nameT.map((w) => sql`lower(${pumsemItems.title} || ' ' || ${pumsemItems.section} || ' ' || ${pumsemItems.chapter}) like ${"%" + w.replace(/[%_\\]/g, "\\$&") + "%"}`);
  let rows: Array<typeof pumsemItems.$inferSelect>;
  try {
    rows = await db.select().from(pumsemItems).where(and(eq(pumsemItems.discipline, discipline as never), or(...likes))).limit(400);
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
  const scored = rows
    .map((r) => ({ r, score: scoreItem(nameT, numT, r) }))
    .filter((x) => x.score > 0 && parseLabors(x.r.labors).length > 0)
    .sort((a, b) => b.score - a.score || a.r.id - b.r.id)
    .slice(0, limit);
  const topScore = scored[0]?.score ?? 0;
  return scored.map((x, i) => ({
    item: { ...x.r, labors: parseLabors(x.r.labors) },
    score: x.score,
    // 이름이 제목에 맞고 규격 숫자까지 맞는 경우만 "추천"(최고점이면서 2위와 격차)
    confident: i === 0 && x.score >= 5 && numT.length > 0 && x.score - (scored[1]?.score ?? 0) >= 2 && topScore === x.score,
  }));
}
