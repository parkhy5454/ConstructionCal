// 견적 검토 알림(순수 함수): 입력 실수나 누락으로 보이는 항목을 찾아 알려 줍니다. 계산을 막지는 않습니다.
import type { BomItem, Material, ComputeResult } from "./calc";

export type EstimateWarning = { level: "warn" | "info"; text: string };

const COUNT_UNITS = new Set(["개", "대", "조", "면", "ea", "EA", "set", "SET", "세트", "본", "식"]);

function names(list: string[], max = 3): string {
  const u = Array.from(new Set(list));
  return u.slice(0, max).join(", ") + (u.length > max ? ` 외 ${u.length - max}개` : "");
}

export function estimateWarnings(materials: Material[], bom: BomItem[], result: ComputeResult): EstimateWarning[] {
  const out: EstimateWarning[] = [];
  const mat = new Map(materials.map((m) => [m.id, m]));
  const label = (b: BomItem) => {
    const m = mat.get(b.materialId);
    return m ? `${m.name}${m.spec ? ` ${m.spec}` : ""}` : "(삭제된 자재)";
  };

  const missing = bom.filter((b) => !mat.has(b.materialId));
  if (missing.length) out.push({ level: "warn", text: `삭제된 자재를 참조하는 행이 ${missing.length}개 있습니다. 해당 행은 재료비·노무비가 0원으로 계산됩니다.` });

  const zeroPrice = bom.filter((b) => b.qty > 0 && (mat.get(b.materialId)?.price ?? 0) === 0 && mat.has(b.materialId));
  if (zeroPrice.length) out.push({ level: "warn", text: `단가가 0원인 자재가 ${new Set(zeroPrice.map((b) => b.materialId)).size}종 쓰이고 있습니다 (${names(zeroPrice.map(label))}). 물가정보 탭에서 단가를 입력하세요.` });

  const frac = bom.filter((b) => {
    const u = mat.get(b.materialId)?.unit ?? "";
    return COUNT_UNITS.has(u) && b.qty !== Math.round(b.qty);
  });
  if (frac.length) out.push({ level: "warn", text: `개수 단위인데 소수 수량이 입력된 행이 있습니다 (${names(frac.map(label))}).` });

  const huge = bom.filter((b) => b.qty >= 100000);
  if (huge.length) out.push({ level: "warn", text: `수량이 10만 이상인 행이 있습니다 (${names(huge.map(label))}). 단위나 자릿수를 확인하세요.` });

  const seen = new Map<string, number>();
  for (const b of bom) {
    const k = `${b.groupName}||${b.materialId}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dup = bom.filter((b) => (seen.get(`${b.groupName}||${b.materialId}`) ?? 0) > 1);
  if (dup.length) out.push({ level: "info", text: `같은 공종에 같은 자재가 여러 행으로 들어 있습니다 (${names(dup.map(label))}). 합쳐도 되는지 확인하세요.` });

  const zeroQty = bom.filter((b) => b.qty === 0);
  if (zeroQty.length) out.push({ level: "info", text: `수량이 0인 행이 ${zeroQty.length}개 있습니다.` });

  if (result.sumMat > 0 && result.sumLabor === 0) {
    out.push({ level: "warn", text: "노무비가 전혀 반영되지 않았습니다. 표준품셈(공수)이 등록된 자재가 없는지 확인하세요." });
  }
  return out;
}
