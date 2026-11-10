// 제출용 문서 7종(수량집계표·단가대비표·일위대가표·일위대가표목록·공사예산내역서·집계표·견적서)에 쓰는 데이터를 계산 결과에서 만듭니다.
// 순수 함수(훅·DB 없음)라서 테스트하기 쉽고, 금액은 기존 계산 결과(ComputeResult)를 그대로 쓰므로 원가계산서와 합계가 항상 일치합니다.
import type { ComputeResult, Material, LaborRate, RateSettings } from "./calc";

export type DocInput = { result: ComputeResult; materials: Material[]; laborRates: LaborRate[]; rates: Pick<RateSettings, "toolLoss"> };

export type IlwiLine = { name: string; spec: string; unit: string; qty: number; mat: number; labor: number; expense: number; unitPrice: { mat: number; labor: number; expense: number } };
export type IlwiBlock = {
  no: number; materialId: number; title: string; name: string; spec: string; unit: string;
  lines: IlwiLine[];
  total: { mat: number; labor: number; expense: number; sum: number };
};

export type DetailRow = {
  name: string; spec: string; unit: string; qty: number;
  matUnit: number; matAmt: number; laborUnit: number; laborAmt: number; expUnit: number; expAmt: number; sumUnit: number; sumAmt: number;
  note: string; extra?: boolean;
};
export type DetailGroup = { g: string; rows: DetailRow[]; total: { mat: number; labor: number; expense: number; sum: number } };

export type PriceRow = { no: string; name: string; spec: string; unit: string; price: number };

export type PrintDocs = {
  matNo: Map<number, number>;
  ilwiNo: Map<number, number>;
  quantity: Array<{ g: string; rows: Array<{ name: string; spec: string; unit: string; qty: number }> }>;
  priceTable: { materials: PriceRow[]; labors: PriceRow[] };
  ilwi: IlwiBlock[];
  detail: DetailGroup[];
};

const trim3 = (n: number) => Number(n.toFixed(3));

export function buildPrintDocs(input: DocInput): PrintDocs {
  const { result, materials, laborRates } = input;
  const tl = input.rates.toolLoss;
  const matById = new Map(materials.map((m) => [m.id, m]));
  const laborByCode = new Map(laborRates.map((l) => [l.code, l]));
  const ildBy = new Map<number, typeof result.ild>();
  for (const r of result.ild) {
    const a = ildBy.get(r.materialId);
    if (a) a.push(r); else ildBy.set(r.materialId, [r]);
  }
  const perUnitLabor = (id: number) => (ildBy.get(id) ?? []).reduce((s, r) => s + r.laborPrice, 0);

  // 번호 매기기: 사용된 자재는 처음 나온 순서대로 자재 N호, 노무(공수)가 있는 자재는 일위 N호
  const matNo = new Map<number, number>();
  const ilwiNo = new Map<number, number>();
  for (const g of result.groupResults) {
    for (const it of g.items) {
      if (!matNo.has(it.materialId)) matNo.set(it.materialId, matNo.size + 1);
      if (!ilwiNo.has(it.materialId) && perUnitLabor(it.materialId) > 0) ilwiNo.set(it.materialId, ilwiNo.size + 1);
    }
  }
  const noteOf = (id: number) => (ilwiNo.has(id) ? `일위 ${ilwiNo.get(id)}호` : `자재 ${matNo.get(id)}호`);

  // 1) 수량집계표
  const quantity = result.groupResults.map((g) => ({
    g: g.g,
    rows: g.items.map((it) => ({ name: it.name, spec: it.spec, unit: it.unit, qty: it.qty })),
  }));

  // 2) 단가대비표
  const usedMats = Array.from(matNo.entries()).sort((a, b) => a[1] - b[1]);
  const materialsRows: PriceRow[] = usedMats.map(([id, no]) => {
    const m = matById.get(id);
    return { no: `자재 ${no}호`, name: m?.name ?? "(삭제된 자재)", spec: m?.spec ?? "", unit: m?.unit ?? "", price: m?.price ?? 0 };
  });
  const laborCodes: string[] = [];
  for (const id of Array.from(ilwiNo.keys())) for (const r of ildBy.get(id) ?? []) if (r.factor > 0 && !laborCodes.includes(r.laborCode)) laborCodes.push(r.laborCode);
  const labors: PriceRow[] = laborCodes.map((code, i) => {
    const l = laborByCode.get(code);
    return { no: `노임 ${i + 1}호`, name: l?.name ?? code, spec: "", unit: "인", price: l?.rate ?? 0 };
  });

  // 3) 일위대가표
  const ilwi: IlwiBlock[] = Array.from(ilwiNo.entries()).sort((a, b) => a[1] - b[1]).map(([id, no]) => {
    const m = matById.get(id);
    const name = m?.name ?? "(삭제된 자재)", spec = m?.spec ?? "", unit = m?.unit ?? "";
    const lines: IlwiLine[] = [];
    const price = m?.price ?? 0;
    lines.push({ name, spec, unit, qty: 1, mat: price, labor: 0, expense: 0, unitPrice: { mat: price, labor: 0, expense: 0 } });
    let L = 0;
    for (const r of ildBy.get(id) ?? []) {
      if (r.factor <= 0) continue;
      const lr = laborByCode.get(r.laborCode);
      const rate = lr?.rate ?? 0;
      L += r.laborPrice;
      lines.push({ name: lr?.name ?? r.laborCode, spec: "", unit: "인", qty: trim3(r.factor), mat: 0, labor: r.laborPrice, expense: 0, unitPrice: { mat: 0, labor: rate, expense: 0 } });
    }
    const tool = L * tl;
    lines.push({ name: "공구손료", spec: `노무비의 ${trim3(tl * 100)}%`, unit: "식", qty: 1, mat: 0, labor: 0, expense: tool, unitPrice: { mat: 0, labor: 0, expense: tool } });
    return { no, materialId: id, title: `[일위 ${no}호] - [${name}${spec ? " " + spec : ""}${unit ? " " + unit : ""}]`, name, spec, unit, lines, total: { mat: price, labor: L, expense: tool, sum: price + L + tool } };
  });

  // 5) 공사예산내역서 (공종별)
  const detail: DetailGroup[] = result.groupResults.map((g) => {
    const rows: DetailRow[] = g.items.map((it) => {
      const L = perUnitLabor(it.materialId);
      const mat = matById.get(it.materialId)?.price ?? 0;
      const exp = L * tl;
      return {
        name: it.name, spec: it.spec, unit: it.unit, qty: it.qty,
        matUnit: mat, matAmt: mat * it.qty, laborUnit: L, laborAmt: L * it.qty, expUnit: exp, expAmt: exp * it.qty,
        sumUnit: mat + L + exp, sumAmt: (mat + L + exp) * it.qty, note: noteOf(it.materialId),
      };
    });
    const extra = (name: string, mat: number, labor: number, expense: number) => {
      if (mat === 0 && labor === 0 && expense === 0) return;
      rows.push({ name, spec: "", unit: "식", qty: 1, matUnit: mat, matAmt: mat, laborUnit: labor, laborAmt: labor, expUnit: expense, expAmt: expense, sumUnit: mat + labor + expense, sumAmt: mat + labor + expense, note: "", extra: true });
    };
    extra("배관 부속재", g.accessory, 0, 0);
    extra("소모 잡자재", g.consumable, 0, 0);
    extra("노무비 할증", 0, g.laborSurcharge, g.laborSurcharge * tl);
    return { g: g.g, rows, total: { mat: g.matTotal, labor: g.laborTotal, expense: g.expenseTotal, sum: g.groupTotal } };
  });

  return { matNo, ilwiNo, quantity, priceTable: { materials: materialsRows, labors }, ilwi, detail };
}

// 금액을 한글로 (예: 18700000 → "일천팔백칠십만")
export function koreanMoney(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return "영";
  const digit = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const small = ["", "십", "백", "천"];
  const big = ["", "만", "억", "조"];
  const parts: string[] = [];
  let bi = 0;
  while (n > 0) {
    const chunk = n % 10000;
    n = Math.floor(n / 10000);
    if (chunk > 0) {
      let s = "";
      for (let i = 3; i >= 0; i--) {
        const d = Math.floor(chunk / 10 ** i) % 10;
        if (d > 0) s += digit[d] + small[i];
      }
      parts.unshift(s + big[bi]);
    }
    bi++;
  }
  return parts.join("");
}

// 원가계산서 항목 옆에 적는 산출 근거(비율은 실제 계산 결과에서 역산하므로 설정과 항상 일치)
export function costBasis(r: ComputeResult) {
  const pct = (a: number, b: number) => (b > 0 ? `${Number(((a / b) * 100).toFixed(2))}%` : "");
  return {
    indirect: `직접노무비의 ${pct(r.indirectLabor, r.sumLabor)}`,
    etc: `가+나의 ${pct(r.etcExpense, r.sumMat + r.laborSubtotal)}`,
    industrial: `나의 ${pct(r.industrialIns, r.laborSubtotal)}`,
    employ: `나의 ${pct(r.employIns, r.laborSubtotal)}`,
    gna: `순공사비의 ${pct(r.gna, r.directCost)} 이내`,
    profit: `나+다+2의 ${pct(r.profit, r.laborSubtotal + r.expenseSubtotal + r.gna)}`,
    vat: `계의 ${pct(r.vat, r.beforeVat)}`,
  };
}
