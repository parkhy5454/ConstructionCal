import {
  computeAll,
  DEFAULT_MATERIALS_BY_DISCIPLINE,
  DEFAULT_LABOR_RATES_BY_DISCIPLINE,
  DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE,
  DEFAULT_BOM_BY_DISCIPLINE,
  DEFAULT_RATE_SETTINGS,
  type Material,
  type Pumsem,
  type BomItem,
  type Discipline,
} from "../lib/calc";

let bad = 0;
for (const d of ["telecom", "fire"] as Discipline[]) {
  const mats: Material[] = DEFAULT_MATERIALS_BY_DISCIPLINE[d]!.map((m, i) => ({ id: i + 1, ...m }));
  const byKey = new Map(mats.map((m) => [`${m.name}|${m.spec}`, m.id]));
  const pumsem: Pumsem[] = DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE[d]!.map((p) => ({
    materialId: byKey.get(`${p.name}|${p.spec}`)!, laborCode: p.laborCode, factor: p.factor,
  }));
  const bom: BomItem[] = [];
  for (const b of DEFAULT_BOM_BY_DISCIPLINE[d]!) {
    const id = byKey.get(`${b.name}|${b.spec}`);
    if (id == null) { console.log(`❌ [${d}] 매칭 실패: ${b.name} | ${b.spec}`); bad++; continue; }
    bom.push({ groupName: b.g, materialId: id, qty: b.qty });
  }
  const r = computeAll(mats, pumsem, DEFAULT_LABOR_RATES_BY_DISCIPLINE[d]!, DEFAULT_RATE_SETTINGS, bom);
  console.log(`\n=== ${d} 예시: BOM ${bom.length}/${DEFAULT_BOM_BY_DISCIPLINE[d]!.length}행 ===`);
  for (const g of r.groupResults) {
    console.log(`  ${g.g}: 재료 ${Math.round(g.matTotal).toLocaleString()} / 노무 ${Math.round(g.laborTotal).toLocaleString()} (${g.laborHeadcount.toFixed(2)}인) / 합 ${Math.round(g.groupTotal).toLocaleString()}`);
    const noLabor = g.items.filter((i) => i.neededLabor === 0).map((i) => i.name);
    if (noLabor.length) console.log(`     품셈 없음 표시 대상: ${noLabor.join(", ")}`);
    if (g.laborAmt === 0) { console.log(`  ❌ ${g.g} 노무비 0`); bad++; }
  }
  console.log(`  재료비 ${Math.round(r.sumMat).toLocaleString()} 노무비 ${Math.round(r.sumLabor).toLocaleString()} 최종(VAT포함) ${Math.round(r.final).toLocaleString()}`);
  if (r.sumLabor <= 0 || r.final <= 0) { console.log("  ❌ 합계 이상"); bad++; }
}
console.log(bad ? `\n❌ ${bad}건 문제` : "\n✅ 예시 견적서 검산 통과");
