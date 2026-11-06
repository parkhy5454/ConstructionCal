// 적산 계산 엔진 — web 프로토타입(app.html)의 computeIlwidaega/computeAll 로직을 그대로 포팅.
// 실제 샘플 견적(카이저솔루션 내역서)과 대조 검증된 산식입니다.

// 업종(공종분야) — 자재/품셈/원가비율이 업종별로 완전히 다르므로 모든 적산 데이터는 업종 단위로 격리됩니다.
export const DISCIPLINES = ["electrical", "telecom", "fire", "mechanical", "civil", "architecture"] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  electrical: "전기",
  telecom: "통신",
  fire: "소방",
  mechanical: "기계",
  civil: "토목",
  architecture: "건축",
};

export type Material = {
  id: number;
  category: string;
  name: string;
  spec: string;
  unit: string;
  price: number;
};

export type LaborRate = { code: string; name: string; rate: number };

export type Pumsem = { materialId: number; laborCode: string; factor: number };

export type RateSettings = {
  indirectLabor: number;
  etcExpense: number;
  industrialIns: number;
  employIns: number;
  gna: number;
  profit: number;
  vat: number;
  pipeAccessory: number;
  consumable: number;
  toolLoss: number;
};

export type BomItem = {
  id?: number;
  groupName: string;
  materialId: number;
  qty: number;
};

export type IlwidaegaRow = {
  materialId: number;
  name: string;
  spec: string;
  unit: string;
  category: string;
  matPrice: number;
  laborPrice: number;
  sum: number;
  factor: number;
};

export function computeIlwidaega(
  materials: Material[],
  pumsemRows: Pumsem[],
  laborRates: LaborRate[]
): IlwidaegaRow[] {
  const laborMap = new Map(laborRates.map((l) => [l.code, l.rate]));
  const matMap = new Map(materials.map((m) => [m.id, m]));
  return pumsemRows.map((p) => {
    const mat = matMap.get(p.materialId);
    const matPrice = mat ? mat.price : 0;
    const laborRate = laborMap.get(p.laborCode) ?? 0;
    const laborPrice = p.factor * laborRate;
    return {
      materialId: p.materialId,
      name: mat?.name ?? "(삭제된 자재)",
      spec: mat?.spec ?? "",
      unit: mat?.unit ?? "",
      category: mat?.category ?? "",
      matPrice,
      laborPrice,
      sum: matPrice + laborPrice,
      factor: p.factor,
    };
  });
}

export type GroupResult = {
  g: string;
  items: Array<{
    materialId: number;
    name: string;
    spec: string;
    unit: string;
    qty: number;
    matAmt: number;
    neededLabor: number;
  }>;
  accessory: number;
  consumable: number;
  laborHeadcount: number;
  laborAmt: number;
  toolLoss: number;
  matTotal: number;
  laborTotal: number;
  expenseTotal: number;
  groupTotal: number;
};

export type ComputeResult = {
  ild: IlwidaegaRow[];
  groupResults: GroupResult[];
  sumMat: number;
  sumLabor: number;
  sumExpense: number;
  indirectLabor: number;
  laborSubtotal: number;
  etcExpense: number;
  industrialIns: number;
  employIns: number;
  expenseSubtotal: number;
  directCost: number;
  gna: number;
  subtotal: number;
  profit: number;
  beforeVat: number;
  vat: number;
  final: number;
};

export function computeAll(
  materials: Material[],
  pumsemRows: Pumsem[],
  laborRates: LaborRate[],
  rates: RateSettings,
  bom: BomItem[],
  mainLaborCode = "L01"
): ComputeResult {
  const ild = computeIlwidaega(materials, pumsemRows, laborRates);
  const ildMap = new Map(ild.map((i) => [i.materialId, i]));
  const matMap = new Map(materials.map((m) => [m.id, m]));
  const laborMap = new Map(laborRates.map((l) => [l.code, l.rate]));
  const mainLaborRate = laborMap.get(mainLaborCode) ?? 0;

  const groups = Array.from(new Set(bom.map((b) => b.groupName)));
  const groupResults: GroupResult[] = groups.map((g) => {
    const rows = bom.filter((b) => b.groupName === g);
    const items = rows.map((b) => {
      const match = ildMap.get(b.materialId);
      const mat = matMap.get(b.materialId);
      const matAmt = (match ? match.matPrice : 0) * b.qty;
      const laborFactor = match ? match.factor : 0;
      const neededLabor = laborFactor * b.qty;
      return {
        materialId: b.materialId,
        name: mat?.name ?? "(삭제된 자재)",
        spec: mat?.spec ?? "",
        unit: mat?.unit ?? "",
        qty: b.qty,
        matAmt,
        neededLabor,
      };
    });

    const pipeBase = rows
      .filter((b) => matMap.get(b.materialId)?.category === "전선관")
      .reduce((s, b) => s + (ildMap.get(b.materialId)?.matPrice ?? 0) * b.qty, 0);
    const wireBase = rows
      .filter((b) => matMap.get(b.materialId)?.category === "전선")
      .reduce((s, b) => s + (ildMap.get(b.materialId)?.matPrice ?? 0) * b.qty, 0);
    const accessory = pipeBase * rates.pipeAccessory;
    const consumable = (pipeBase + wireBase) * rates.consumable;

    const laborHeadcount = items.reduce((s, i) => s + i.neededLabor, 0);
    const laborAmt = laborHeadcount * mainLaborRate;
    const toolLoss = laborAmt * rates.toolLoss;

    const matTotal = items.reduce((s, i) => s + i.matAmt, 0) + accessory + consumable;
    const laborTotal = laborAmt;
    const expenseTotal = toolLoss;
    const groupTotal = matTotal + laborTotal + expenseTotal;

    return { g, items, accessory, consumable, laborHeadcount, laborAmt, toolLoss, matTotal, laborTotal, expenseTotal, groupTotal };
  });

  const sumMat = groupResults.reduce((s, g) => s + g.matTotal, 0);
  const sumLabor = groupResults.reduce((s, g) => s + g.laborTotal, 0);
  const sumExpense = groupResults.reduce((s, g) => s + g.expenseTotal, 0);

  const indirectLabor = sumLabor * rates.indirectLabor;
  const laborSubtotal = sumLabor + indirectLabor;
  const etcExpense = (sumMat + laborSubtotal) * rates.etcExpense;
  const industrialIns = laborSubtotal * rates.industrialIns;
  const employIns = laborSubtotal * rates.employIns;
  const expenseSubtotal = etcExpense + industrialIns + employIns;
  const directCost = sumMat + laborSubtotal + expenseSubtotal;
  const gna = directCost * rates.gna;
  const subtotal = directCost + gna;
  const profit = (laborSubtotal + expenseSubtotal + gna) * rates.profit;
  const beforeVat = subtotal + profit;
  const vat = beforeVat * rates.vat;
  const final = beforeVat + vat;

  return {
    ild, groupResults, sumMat, sumLabor, sumExpense,
    indirectLabor, laborSubtotal, etcExpense, industrialIns, employIns, expenseSubtotal,
    directCost, gna, subtotal, profit, beforeVat, vat, final,
  };
}

// ---------- 신규 계정 시드용 기본 데이터 (검증된 예시값) ----------

export const DEFAULT_LABOR_RATES: LaborRate[] = [{ code: "L01", name: "내선전공", rate: 239716 }];

export const DEFAULT_RATE_SETTINGS: RateSettings = {
  indirectLabor: 0.08,
  etcExpense: 0.0549,
  industrialIns: 0.0373,
  employIns: 0.0087,
  gna: 0.06,
  profit: 0.15,
  vat: 0.1,
  pipeAccessory: 0.15,
  consumable: 0.02,
  toolLoss: 0.03,
};

// 가격 출처: 종합물가정보(한국물가정보) 2026년 11월호, 서울 기준(업로드 PDF에서 확인된 항목만 실가격 반영).
// 콘센트/스위치/LED조명/감지기는 해당 가격 페이지가 확보되지 않아 추정치를 유지함(표준품셈 공수는 실수치 반영, 아래 DEFAULT_PUMSEM_FACTORS 참고).
export const DEFAULT_MATERIALS: Array<Omit<Material, "id">> = [
  { category: "전선관", name: "강제전선관(노출)", spec: "아연도 16mm", unit: "M", price: 3374 },
  { category: "전선관", name: "강제전선관(노출)", spec: "아연도 22mm", unit: "M", price: 4368 },
  { category: "전선관", name: "1종금속제가요전선관", spec: "16mm 일반-비방수", unit: "M", price: 544 },
  { category: "기구", name: "1종금속제가요전선관 커넥터", spec: "16mm 일반-비방수", unit: "개", price: 346 },
  { category: "전선", name: "450/750V 내열비닐절연전선(HFIX)", spec: "2.25mm²(4㎟)", unit: "M", price: 1535 },
  { category: "전선", name: "450/750V 내열비닐절연전선(HFIX)", spec: "1.38mm²(1.5㎟)", unit: "M", price: 598 },
  { category: "전선", name: "450/750V 내열비닐절연전선(HFIX)", spec: "1.78mm²(2.5㎟)", unit: "M", price: 985 },
  { category: "기구", name: "콘센트", spec: "매입-접지형, 15A 250V 2구", unit: "개", price: 1879 },
  { category: "기구", name: "풀박스", spec: "150*150*100", unit: "개", price: 4110 },
  { category: "기구", name: "노출박스", spec: "16mm-1방출", unit: "개", price: 600 },
  { category: "기구", name: "아우트렛박스", spec: "8각54mm", unit: "개", price: 845 },
  { category: "기구", name: "누전차단기", spec: "2P 30A", unit: "개", price: 13100 },
  { category: "기구", name: "와이드 스위치", spec: "SUPPER WIDE 15A 250V 1로1구", unit: "개", price: 3760 },
  { category: "기구", name: "와이드 스위치", spec: "SUPPER WIDE 15A 250V 1로2구", unit: "개", price: 5440 },
  { category: "기구", name: "LED 조명기구", spec: "평판T-BAR 300*1200 50W", unit: "개", price: 48000 },
  { category: "기구", name: "LED 조명기구", spec: "평판M-BAR 1200*300 50W", unit: "개", price: 45000 },
  { category: "기구", name: "감지기(차동식)", spec: "차동식", unit: "개", price: 5000 },
];

// materialName|spec -> 품셈(공수) 매핑 (시드 시 생성된 material id로 치환됨)
// 출처: 전기부문 표준품셈 2026(대한전기협회), 제5장 내선설비공사 — 5-1 전선관배관, 5-3 박스설치,
// 5-10 옥내배선, 5-19 차단기및개폐기설치, 5-23 배선기구설치, 5-25-3 LED등기구설치.
// 감지기(차동식)는 전기부문 표준품셈에 항목이 없어 추정치를 유지함.
export const DEFAULT_PUMSEM_FACTORS: Array<{ name: string; spec: string; laborCode: string; factor: number }> = [
  // 5-1 전선관 배관: 후강전선관(매입기준) × 1.2(노출 할증, 【해설】②)
  { name: "강제전선관(노출)", spec: "아연도 16mm", laborCode: "L01", factor: 0.096 },
  { name: "강제전선관(노출)", spec: "아연도 22mm", laborCode: "L01", factor: 0.132 },
  // 나사없는 전선관(E, 16mm이하 기준)
  { name: "1종금속제가요전선관", spec: "16mm 일반-비방수", laborCode: "L01", factor: 0.044 },
  // 전선관 부속품(커플링/커넥터 등)은 【해설】에 따라 전선관 배관 품에 포함, 별도 품 없음
  { name: "1종금속제가요전선관 커넥터", spec: "16mm 일반-비방수", laborCode: "L01", factor: 0 },
  // 5-10 옥내배선: 6㎟ 이하 공통
  { name: "450/750V 내열비닐절연전선(HFIX)", spec: "2.25mm²(4㎟)", laborCode: "L01", factor: 0.01 },
  { name: "450/750V 내열비닐절연전선(HFIX)", spec: "1.38mm²(1.5㎟)", laborCode: "L01", factor: 0.01 },
  { name: "450/750V 내열비닐절연전선(HFIX)", spec: "1.78mm²(2.5㎟)", laborCode: "L01", factor: 0.01 },
  // 5-23 배선기구 설치 ㈎콘센트류: 접지극부 15A 2P
  { name: "콘센트", spec: "매입-접지형, 15A 250V 2구", laborCode: "L01", factor: 0.08 },
  // 5-3 박스설치: 연결용박스/노출형박스(콘크리트노출기준)/Outlet박스
  { name: "풀박스", spec: "150*150*100", laborCode: "L01", factor: 0.04 },
  { name: "노출박스", spec: "16mm-1방출", laborCode: "L01", factor: 0.29 },
  { name: "아우트렛박스", spec: "8각54mm", laborCode: "L01", factor: 0.2 },
  // 5-19: 배선용차단기 30AF이하(0.19) × 2P 70%, 【해설】⑥ 누전차단기는 배선용차단기 품 준용
  { name: "누전차단기", spec: "2P 30A", laborCode: "L01", factor: 0.133 },
  // 5-23 ㈏스위치류: 텀블러스위치 단로용(1구는 그대로, 2구는 단로용×2로 근사)
  { name: "와이드 스위치", spec: "SUPPER WIDE 15A 250V 1로1구", laborCode: "L01", factor: 0.085 },
  { name: "와이드 스위치", spec: "SUPPER WIDE 15A 250V 1로2구", laborCode: "L01", factor: 0.17 },
  // 5-25-3 LED등기구설치: 매입 및 반매입, 55W 이하 구간(50W 해당)
  { name: "LED 조명기구", spec: "평판T-BAR 300*1200 50W", laborCode: "L01", factor: 0.306 },
  { name: "LED 조명기구", spec: "평판M-BAR 1200*300 50W", laborCode: "L01", factor: 0.306 },
  { name: "감지기(차동식)", spec: "차동식", laborCode: "L01", factor: 0.1 },
];

export const DEFAULT_BOM: Array<{ g: string; name: string; spec: string; qty: number }> = [
  { g: "1.전열공사", name: "강제전선관(노출)", spec: "아연도 16mm", qty: 24 },
  { g: "1.전열공사", name: "강제전선관(노출)", spec: "아연도 22mm", qty: 5 },
  { g: "1.전열공사", name: "1종금속제가요전선관", spec: "16mm 일반-비방수", qty: 26 },
  { g: "1.전열공사", name: "1종금속제가요전선관 커넥터", spec: "16mm 일반-비방수", qty: 16 },
  { g: "1.전열공사", name: "450/750V 내열비닐절연전선(HFIX)", spec: "2.25mm²(4㎟)", qty: 193 },
  { g: "1.전열공사", name: "콘센트", spec: "매입-접지형, 15A 250V 2구", qty: 8 },
  { g: "1.전열공사", name: "풀박스", spec: "150*150*100", qty: 2 },
  { g: "1.전열공사", name: "노출박스", spec: "16mm-1방출", qty: 1 },
  { g: "1.전열공사", name: "아우트렛박스", spec: "8각54mm", qty: 2 },
  { g: "1.전열공사", name: "누전차단기", spec: "2P 30A", qty: 1 },
  { g: "2.전등공사", name: "1종금속제가요전선관", spec: "16mm 일반-비방수", qty: 89 },
  { g: "2.전등공사", name: "1종금속제가요전선관 커넥터", spec: "16mm 일반-비방수", qty: 38 },
  { g: "2.전등공사", name: "450/750V 내열비닐절연전선(HFIX)", spec: "1.38mm²(1.5㎟)", qty: 176 },
  { g: "2.전등공사", name: "450/750V 내열비닐절연전선(HFIX)", spec: "1.78mm²(2.5㎟)", qty: 118 },
  { g: "2.전등공사", name: "와이드 스위치", spec: "SUPPER WIDE 15A 250V 1로1구", qty: 2 },
  { g: "2.전등공사", name: "와이드 스위치", spec: "SUPPER WIDE 15A 250V 1로2구", qty: 4 },
  { g: "2.전등공사", name: "LED 조명기구", spec: "평판T-BAR 300*1200 50W", qty: 6 },
  { g: "2.전등공사", name: "LED 조명기구", spec: "평판M-BAR 1200*300 50W", qty: 8 },
  { g: "2.전등공사", name: "감지기(차동식)", spec: "차동식", qty: 8 },
  { g: "2.전등공사", name: "아우트렛박스", spec: "8각54mm", qty: 4 },
];

export function fmt(n: number): string {
  if (!isFinite(n)) return "0";
  return Math.round(n).toLocaleString("ko-KR");
}
