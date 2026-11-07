import { matchRows } from "../lib/excelMatch";
import { DEFAULT_MATERIALS } from "../lib/calc";

const mats = DEFAULT_MATERIALS.map((m, i) => ({ id: i + 1, ...m }));
const cases: Array<[string, string, number | null]> = [
  ["HFIX", "2.5sq", 7],
  ["HFIX 전선", "2.5㎟", 7],
  ["HFIX", "4sq", 5],
  ["HFIX", "1.5SQ", 6],
  ["후강전선관", "16mm", 1],
  ["강제전선관", "22mm", 2],
  ["가요전선관", "16mm", 3],
  ["콘센트 2구", "접지형 15A", 8],
  ["누전차단기", "2P 30A", 12],
  ["HFIX", "6sq", null], // DB에 없는 규격 → 엉뚱한 규격에 붙으면 안 됨
  ["스테인리스 맨홀", "1200", null],
];
const res = matchRows(cases.map(([name, spec]) => ({ name, spec })), mats, new Map());
let bad = 0;
cases.forEach(([name, spec, want], i) => {
  const r = res[i];
  const mat = mats.find((m) => m.id === r.materialId);
  const ok = want === null ? r.method !== "exact" && (r.materialId === null || r.method === "fuzzy") : r.materialId === want;
  if (!ok) bad++;
  console.log(`${ok ? "OK " : "XX "} ${name} ${spec} → ${r.method}(${r.score}) ${mat ? `${mat.name} | ${mat.spec}` : "-"}  (기대 id ${want})`);
});
console.log(bad ? `\n❌ ${bad}건 불일치` : "\n✅ 통과");
