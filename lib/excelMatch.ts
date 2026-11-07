// 엑셀 내역서의 품명/규격을 우리 자재 DB와 매칭하는 순수 함수 모음.
// 브라우저(확인 화면)와 서버(분석 API) 양쪽에서 쓰므로 exceljs 등 서버 전용 모듈을 import하지 않습니다.

export type MatLite = { id: number; name: string; spec: string; unit: string };
export type MatchMethod = "saved" | "exact" | "fuzzy" | "none";
export type MatchResult = { materialId: number | null; method: MatchMethod; score: number; key: string };

// 표기가 달라도 같은 자재로 비교되도록 정규화합니다 (공백/구분기호 제거, ㎟·mm²→sq, ×·*→x, 직경기호 통일).
export function normText(s: string): string {
  return s
    .toLowerCase()
    // 현장에서 같은 자재를 달리 부르는 대표 용어 (양쪽 모두 같은 규칙으로 정규화되므로 일관됨)
    .replace(/후강전선관|후강/g, "강제전선관")
    .replace(/가요관/g, "가요전선관")
    .replace(/㎟|㎜²|mm²|mm2/g, "sq")
    .replace(/㎜/g, "mm")
    .replace(/cat\./g, "cat")
    .replace(/[φø∅ф]/g, "φ")
    .replace(/[×*]/g, "x")
    .replace(/[\s\-_/(),·[\]{}~'"`:;]/g, "");
}

// 단위 비교용 정규화 (EA=개, m²=㎡ 등)
export function normUnit(u: string): string {
  const s = u.toLowerCase().replace(/\s+/g, "");
  if (s === "ea" || s === "개소") return "개";
  if (s === "미터") return "m";
  if (s === "㎡" || s === "m²") return "m2";
  if (s === "ls" || s === "lot") return "식";
  return s;
}

// 매칭 기억(저장) 키 — dxf_mappings.matchName(varchar 200)에 들어가므로 길이를 제한합니다.
export function matchKey(name: string, spec: string): string {
  return `${normText(name)}|${normText(spec)}`.slice(0, 200);
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length < 2) {
    if (s) out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function intersectCount(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  a.forEach((x) => {
    if (b.has(x)) inter++;
  });
  return inter;
}

function numberTokens(s: string): Set<string> {
  return new Set(s.match(/\d+(?:\.\d+)?/g) ?? []);
}

export const FUZZY_THRESHOLD = 0.5;

// 우선순위: 저장된 매칭 → 정확 일치 → 유사 일치(숫자 규격이 다르면 크게 감점: 2.5sq ≠ 4sq).
export function matchRows(
  rows: Array<{ name: string; spec: string }>,
  materials: MatLite[],
  memory: Map<string, number>
): MatchResult[] {
  const ids = new Set(materials.map((m) => m.id));
  const prepared = materials.map((m) => {
    const comb = normText(m.name) + normText(m.spec);
    return { id: m.id, comb, nums: numberTokens(comb), bg: bigrams(comb) };
  });
  const exactMap = new Map<string, number>();
  for (const p of prepared) if (!exactMap.has(p.comb)) exactMap.set(p.comb, p.id);

  return rows.map((r) => {
    const key = matchKey(r.name, r.spec);
    const saved = memory.get(key);
    if (saved != null && ids.has(saved)) return { materialId: saved, method: "saved" as const, score: 1, key };

    const comb = normText(r.name) + normText(r.spec);
    if (!comb) return { materialId: null, method: "none" as const, score: 0, key };
    const ex = exactMap.get(comb);
    if (ex != null) return { materialId: ex, method: "exact" as const, score: 1, key };

    const nums = numberTokens(comb);
    const bg = bigrams(comb);
    let bestId: number | null = null;
    let best = 0;
    let bestDice = 0;
    for (const p of prepared) {
      const inter = intersectCount(bg, p.bg);
      const diceScore = bg.size + p.bg.size > 0 ? (2 * inter) / (bg.size + p.bg.size) : 0;
      // DB 품명이 길고 현장 표기가 줄임말(예: "HFIX 2.5sq")이면 dice가 낮으므로,
      // 행의 글자쌍이 자재명에 얼마나 포함되는지(coverage)도 함께 봅니다.
      const cover = bg.size > 0 ? inter / bg.size : 0;
      let d = Math.max(diceScore, comb.length >= 4 ? cover * 0.85 : 0);
      const shorter = Math.min(comb.length, p.comb.length);
      if (shorter >= 3 && (comb.includes(p.comb) || p.comb.includes(comb))) d = Math.max(d, 0.75);
      // 숫자 규격(2.5sq, 16mm, 30A …)은 품목을 가르는 핵심이므로, 행의 숫자가 자재에 얼마나 있는지로 가중합니다.
      // 숫자가 하나라도 다르면 크게 감점되어 4sq가 2.5sq에 붙는 일을 막습니다.
      const score =
        nums.size > 0 && p.nums.size > 0
          ? d * (0.4 + 0.6 * (intersectCount(nums, p.nums) / nums.size))
          : d * 0.85;
      if (score > best || (score === best && diceScore > bestDice)) {
        best = score;
        bestId = p.id;
        bestDice = diceScore;
      }
    }
    if (bestId != null && best >= FUZZY_THRESHOLD) {
      return { materialId: bestId, method: "fuzzy" as const, score: Math.round(best * 100) / 100, key };
    }
    return { materialId: null, method: "none" as const, score: Math.round(best * 100) / 100, key };
  });
}
