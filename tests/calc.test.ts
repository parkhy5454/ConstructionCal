import {
  computeAll,
  DEFAULT_MATERIALS_BY_DISCIPLINE,
  DEFAULT_LABOR_RATES_BY_DISCIPLINE,
  DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE,
  DEFAULT_RATE_SETTINGS,
  DISCIPLINE_LABELS,
  type Material,
  type Pumsem,
  type BomItem,
  type Discipline,
} from "../lib/calc";

function verify(discipline: Discipline) {
  const defs = DEFAULT_MATERIALS_BY_DISCIPLINE[discipline]!;
  const labor = DEFAULT_LABOR_RATES_BY_DISCIPLINE[discipline]!;
  const pumsemDefs = DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE[discipline]!;

  // DB가 자동증가 id를 부여하는 것을 흉내
  const materials: Material[] = defs.map((m, i) => ({ id: i + 1, ...m }));
  const matIdByKey = new Map(materials.map((m) => [`${m.name}|${m.spec}`, m.id]));
  const pumsem: Pumsem[] = pumsemDefs
    .map((p) => {
      const materialId = matIdByKey.get(`${p.name}|${p.spec}`);
      if (materialId == null) {
        console.log(`  ⚠️  매칭 실패: ${p.name} ${p.spec}`);
        return null;
      }
      return { materialId, laborCode: p.laborCode, factor: p.factor };
    })
    .filter((x): x is Pumsem => x !== null);

  // 모든 자재를 BOM에 1개씩 넣어 전체를 한 번에 검산
  const bom: BomItem[] = materials.map((m) => ({ groupName: "검증", materialId: m.id, qty: 1 }));

  const result = computeAll(materials, pumsem, labor, DEFAULT_RATE_SETTINGS, bom);

  console.log(`\n=== ${DISCIPLINE_LABELS[discipline]}(${discipline}) ===`);
  console.log(`자재 수: ${materials.length}, 품셈 행 수: ${pumsem.length}`);
  for (const row of result.ild) {
    const mat = materials.find((m) => m.id === row.materialId)!;
    console.log(
      `  ${mat.name.padEnd(14)} ${mat.spec.padEnd(20)} 재료비=${row.matPrice.toLocaleString()} 노무비=${Math.round(row.laborPrice).toLocaleString()} (factor=${row.factor})`
    );
  }
  // 품셈이 전혀 없는 자재 확인(의도된 것인지 체크용)
  const matIdsWithPumsem = new Set(pumsem.map((p) => p.materialId));
  const noPumsem = materials.filter((m) => !matIdsWithPumsem.has(m.id));
  if (noPumsem.length) {
    console.log(`  (품셈 없음 — 재료비만 반영) ${noPumsem.map((m) => m.name).join(", ")}`);
  }
  console.log(`재료비 합계: ${Math.round(result.sumMat).toLocaleString()}`);
  console.log(`노무비 합계: ${Math.round(result.sumLabor).toLocaleString()}`);
  console.log(`최종 합계(VAT포함): ${Math.round(result.final).toLocaleString()}`);
  if (result.sumLabor === 0) {
    console.log("  ❌ 노무비 합계가 0입니다 — 버그 의심!");
  } else {
    console.log("  ✅ 노무비가 정상적으로 반영됨");
  }
}

verify("telecom");
verify("fire");
