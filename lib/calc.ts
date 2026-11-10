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
  laborCode: string;
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
      laborCode: p.laborCode,
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

// 할증·보정: 현장 조건(고소작업·협소·야간 등)에 따라 노무비에 가산하는 비율. group이 null이면 전체 공종에 적용.
export type Surcharge = { id: string; label: string; percent: number; group: string | null };

export function surchargePercentFor(group: string, surcharges: Surcharge[] | undefined): number {
  if (!surcharges || surcharges.length === 0) return 0;
  const sum = surcharges.reduce((s, x) => (x.group == null || x.group === group ? s + x.percent : s), 0);
  return Math.max(-100, sum); // 노무비가 음수가 되지 않도록 -100%까지만
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
  laborAmt: number; // 할증 전 노무비
  laborSurcharge: number; // 할증으로 가산된 노무비(없으면 0)
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
  surcharges?: Surcharge[]
): ComputeResult {
  const ild = computeIlwidaega(materials, pumsemRows, laborRates);
  const matMap = new Map(materials.map((m) => [m.id, m]));
  // 자재 하나가 서로 다른 노임코드(직종)의 품셈 행을 여러 개 가질 수 있으므로(예: 배관공+보통인부),
  // materialId -> 해당 자재의 모든 일위대가 행 배열로 보관해 단가/공수를 합산합니다.
  const ildByMat = new Map<number, IlwidaegaRow[]>();
  for (const row of ild) {
    const arr = ildByMat.get(row.materialId);
    if (arr) arr.push(row);
    else ildByMat.set(row.materialId, [row]);
  }
  const matPriceOf = (materialId: number) => matMap.get(materialId)?.price ?? 0;

  const groups = Array.from(new Set(bom.map((b) => b.groupName)));
  const groupResults: GroupResult[] = groups.map((g) => {
    const rows = bom.filter((b) => b.groupName === g);
    const items = rows.map((b) => {
      const mat = matMap.get(b.materialId);
      const matRows = ildByMat.get(b.materialId) ?? [];
      // 품셈 데이터가 없는 자재(예: 설치 품셈이 없는 소화기)도 재료비는 항상 반영됩니다.
      const matAmt = matPriceOf(b.materialId) * b.qty;
      const laborFactor = matRows.reduce((s, r) => s + r.factor, 0);
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
      .reduce((s, b) => s + matPriceOf(b.materialId) * b.qty, 0);
    const wireBase = rows
      .filter((b) => matMap.get(b.materialId)?.category === "전선")
      .reduce((s, b) => s + matPriceOf(b.materialId) * b.qty, 0);
    const accessory = pipeBase * rates.pipeAccessory;
    const consumable = (pipeBase + wireBase) * rates.consumable;

    // 실제 노무비(원) = 자재별로 매칭된 모든 품셈 행(직종별 공수 × 해당 직종 노임단가)의 합 × 수량.
    // 자재 하나에 직종이 여러 개 섞여 있어도(예: 배관공+보통인부) 각 직종의 실제 단가가 그대로 반영됩니다.
    const laborAmt = rows.reduce((s, b) => {
      const matRows = ildByMat.get(b.materialId) ?? [];
      const perUnitLabor = matRows.reduce((s2, r) => s2 + r.laborPrice, 0);
      return s + perUnitLabor * b.qty;
    }, 0);
    const laborHeadcount = items.reduce((s, i) => s + i.neededLabor, 0);
    const laborSurcharge = (laborAmt * surchargePercentFor(g, surcharges)) / 100;
    const toolLoss = (laborAmt + laborSurcharge) * rates.toolLoss;

    const matTotal = items.reduce((s, i) => s + i.matAmt, 0) + accessory + consumable;
    const laborTotal = laborAmt + laborSurcharge;
    const expenseTotal = toolLoss;
    const groupTotal = matTotal + laborTotal + expenseTotal;

    return { g, items, accessory, consumable, laborHeadcount, laborAmt, laborSurcharge, toolLoss, matTotal, laborTotal, expenseTotal, groupTotal };
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

// 가격 출처: 종합물가정보(한국물가정보) 2026년 11월호, 10장 정보통신(전화·통신장치/방송음향기기/네트워크장비).
// 표준품셈(공수) 데이터는 아래 DEFAULT_PUMSEM_FACTORS_TELECOM 참고(2026년 정보통신공사 표준품셈 기반).
export const DEFAULT_MATERIALS_TELECOM: Array<Omit<Material, "id">> = [
  { category: "통신단자함", name: "전화단자함(국선단자함)", spec: "40×100P, 매입연강", unit: "Set", price: 243930 },
  { category: "통신단자함", name: "MDF(주배선반)", spec: "100P보호기 100P당", unit: "개", price: 308880 },
  { category: "통신단자함", name: "TV분배기함", spec: "300×400mm, 매입연강", unit: "개", price: 62550 },
  { category: "통신기기", name: "월패드", spec: "일반형 10인치", unit: "대", price: 700000 },
  { category: "통신기기", name: "비디오폰", spec: "표준형", unit: "대", price: 360000 },
  { category: "통신기기", name: "인터폰", spec: "공동현관/경비실 연동", unit: "대", price: 70000 },
  { category: "통신기기", name: "현관카메라", spec: "컬러CCD", unit: "대", price: 60000 },
  { category: "통신기기", name: "FDF(광단자함)", spec: "4Port", unit: "개", price: 100000 },
  { category: "통신기기", name: "네트워크스위치(PoE)", spec: "1G SFP 2Port/UTP 8Port", unit: "대", price: 2604800 },
  { category: "통신배선", name: "LAN케이블", spec: "Cat.5E, 4P", unit: "M", price: 1500 },
  { category: "통신배선", name: "LAN케이블(고급)", spec: "Cat.6E, 4P", unit: "M", price: 3500 },
  { category: "통신관", name: "통신용 플렉시블전선관", spec: "22mm", unit: "M", price: 5000 },
  { category: "통신관", name: "통신용 플렉시블전선관", spec: "28mm", unit: "M", price: 6500 },
  { category: "방송설비", name: "실링스피커", spec: "10W, 매입형", unit: "개", price: 84000 },
  { category: "방송설비", name: "월스피커", spec: "10W, 벽부형", unit: "개", price: 101000 },
  { category: "방송설비", name: "비상방송용 앰프", spec: "360W급, 8채널, 2U", unit: "대", price: 2625000 },
  { category: "무선통신", name: "업무용 무전기", spec: "UHF, 4.8W", unit: "대", price: 440000 },
];

// 가격 출처: 종합물가정보(한국물가정보) 2026년 11월호, 11장 소방·안전·화학(소방시설/화재경보기).
// 표준품셈(공수) 데이터는 아래 DEFAULT_PUMSEM_FACTORS_FIRE 참고(2026년 소방공사 표준품셈 기반).
export const DEFAULT_MATERIALS_FIRE: Array<Omit<Material, "id">> = [
  { category: "소화기", name: "ABC분말소화기", spec: "3.3kg, 약제충전", unit: "개", price: 25000 },
  { category: "소화전설비", name: "옥내소화전함", spec: "25A×25M, 드럼형, 강재", unit: "개", price: 380000 },
  { category: "소화전설비", name: "호스릴옥내소화전함", spec: "저층형, 호스 25M", unit: "개", price: 302500 },
  { category: "스프링클러설비", name: "습식 알람밸브", spec: "100A, 10K, 그루브형", unit: "개", price: 480000 },
  { category: "스프링클러설비", name: "프리액션밸브(개방형)", spec: "100A, 1.0MPa", unit: "개", price: 950000 },
  { category: "스프링클러설비", name: "스프링클러헤드", spec: "72℃, 표준반응형, 플러셔형", unit: "개", price: 9400 },
  { category: "경보설비", name: "차동식스포트형감지기", spec: "2종, 보통형", unit: "개", price: 5000 },
  { category: "경보설비", name: "정온식스포트형감지기", spec: "특종, 보통형, 70℃", unit: "개", price: 5000 },
  { category: "경보설비", name: "광전식연기감지기", spec: "2종", unit: "개", price: 30000 },
  { category: "경보설비", name: "발신기", spec: "P형 1종", unit: "개", price: 7000 },
  { category: "경보설비", name: "경종", spec: "90dB", unit: "개", price: 10500 },
  { category: "경보설비", name: "표시등", spec: "DC24V, 사각형", unit: "개", price: 2500 },
  { category: "경보설비", name: "수동발신기세트", spec: "P형, 전강판", unit: "Set", price: 155000 },
  { category: "피난설비", name: "통로유도등", spec: "LED, 소형, 60분용", unit: "개", price: 60000 },
  { category: "피난설비", name: "비상조명등", spec: "소화전내장형", unit: "개", price: 70000 },
];

// 업종별 기본 시드 자재. 전기 외 업종은 아직 표준품셈이 없어 자재단가만 제공됩니다.
export const DEFAULT_MATERIALS_BY_DISCIPLINE: Partial<Record<Discipline, Array<Omit<Material, "id">>>> = {
  telecom: DEFAULT_MATERIALS_TELECOM,
  fire: DEFAULT_MATERIALS_FIRE,
};

// 업종 처음 접근 시 함께 만들어 주는 "예시 견적서" 물량. 신규 사용자가 빈 화면이 아니라
// 재료비·노무비·원가계산서까지 채워진 결과를 바로 볼 수 있게 합니다. 수량은 설명용 가상 값입니다.
// 품명/규격은 위 DEFAULT_MATERIALS_*와 정확히 같아야 매칭됩니다(scratch 검산 스크립트로 확인).
export const DEFAULT_BOM_BY_DISCIPLINE: Partial<Record<Discipline, Array<{ g: string; name: string; spec: string; qty: number }>>> = {
  telecom: [
    { g: "1.세대통신공사", name: "통신용 플렉시블전선관", spec: "22mm", qty: 120 },
    { g: "1.세대통신공사", name: "통신용 플렉시블전선관", spec: "28mm", qty: 30 },
    { g: "1.세대통신공사", name: "LAN케이블", spec: "Cat.5E, 4P", qty: 400 },
    { g: "1.세대통신공사", name: "전화단자함(국선단자함)", spec: "40×100P, 매입연강", qty: 1 },
    { g: "1.세대통신공사", name: "TV분배기함", spec: "300×400mm, 매입연강", qty: 1 },
    { g: "1.세대통신공사", name: "월패드", spec: "일반형 10인치", qty: 1 },
    { g: "1.세대통신공사", name: "현관카메라", spec: "컬러CCD", qty: 1 },
    { g: "1.세대통신공사", name: "인터폰", spec: "공동현관/경비실 연동", qty: 1 },
    { g: "2.공용부통신공사", name: "통신용 플렉시블전선관", spec: "28mm", qty: 80 },
    { g: "2.공용부통신공사", name: "LAN케이블(고급)", spec: "Cat.6E, 4P", qty: 300 },
    { g: "2.공용부통신공사", name: "MDF(주배선반)", spec: "100P보호기 100P당", qty: 1 },
    { g: "2.공용부통신공사", name: "FDF(광단자함)", spec: "4Port", qty: 2 },
    { g: "2.공용부통신공사", name: "네트워크스위치(PoE)", spec: "1G SFP 2Port/UTP 8Port", qty: 2 },
    { g: "3.방송설비공사", name: "실링스피커", spec: "10W, 매입형", qty: 24 },
    { g: "3.방송설비공사", name: "월스피커", spec: "10W, 벽부형", qty: 6 },
    { g: "3.방송설비공사", name: "비상방송용 앰프", spec: "360W급, 8채널, 2U", qty: 1 },
  ],
  fire: [
    // ABC분말소화기는 표준품셈에 설치 공수가 없어 "재료비만 반영" 안내가 표시되는 대표 품목입니다.
    { g: "1.소화설비", name: "ABC분말소화기", spec: "3.3kg, 약제충전", qty: 8 },
    { g: "1.소화설비", name: "옥내소화전함", spec: "25A×25M, 드럼형, 강재", qty: 4 },
    { g: "1.소화설비", name: "호스릴옥내소화전함", spec: "저층형, 호스 25M", qty: 2 },
    { g: "1.소화설비", name: "습식 알람밸브", spec: "100A, 10K, 그루브형", qty: 1 },
    { g: "1.소화설비", name: "스프링클러헤드", spec: "72℃, 표준반응형, 플러셔형", qty: 120 },
    { g: "2.경보설비", name: "차동식스포트형감지기", spec: "2종, 보통형", qty: 40 },
    { g: "2.경보설비", name: "정온식스포트형감지기", spec: "특종, 보통형, 70℃", qty: 6 },
    { g: "2.경보설비", name: "광전식연기감지기", spec: "2종", qty: 12 },
    { g: "2.경보설비", name: "수동발신기세트", spec: "P형, 전강판", qty: 6 },
    { g: "3.피난설비", name: "통로유도등", spec: "LED, 소형, 60분용", qty: 30 },
    { g: "3.피난설비", name: "비상조명등", spec: "소화전내장형", qty: 12 },
  ],
};

// ---------- 소방(fire) 표준품셈 — 2026년 소방공사 표준품셈(한국소방시설협회, 정부승인) ----------
// 노임단가 출처: 2026.1.1 적용 시중노임단가(내선전공/배관공/보통인부, 공사부문 공표).
export const DEFAULT_LABOR_RATES_FIRE: LaborRate[] = [
  { code: "F01", name: "내선전공", rate: 273676 },
  { code: "F02", name: "배관공", rate: 247897 },
  { code: "F03", name: "보통인부", rate: 172068 },
];

// 출처: 2026년 소방공사 표준품셈 — 6-1-1 옥내소화전 설치, 6-3-1 스프링클러 설치,
// 8-1-1-1 Spot형 감지기, 8-1-2 발신기, 9-2-3 통로유도등, 9-3-1 비상조명등(벽부형).
// ABC분말소화기(휴대용)는 책에 설치 품셈이 없어(단순 비치 품목) 노무비 0으로 둡니다.
// 광전식연기감지기·수동발신기세트는 동일/인접 품목을 근거로 한 근사치입니다.
export const DEFAULT_PUMSEM_FACTORS_FIRE: Array<{ name: string; spec: string; laborCode: string; factor: number }> = [
  // 6-1-1 옥내소화전 설치 — 옥내소화전함(매입형 기준)
  { name: "옥내소화전함", spec: "25A×25M, 드럼형, 강재", laborCode: "F02", factor: 0.906 },
  { name: "옥내소화전함", spec: "25A×25M, 드럼형, 강재", laborCode: "F03", factor: 0.375 },
  // 호스릴형(저층형)은 노출형 기준 적용
  { name: "호스릴옥내소화전함", spec: "저층형, 호스 25M", laborCode: "F02", factor: 0.816 },
  { name: "호스릴옥내소화전함", spec: "저층형, 호스 25M", laborCode: "F03", factor: 0.338 },
  // 6-3-1 스프링클러 설치 — 알람밸브(습식, Ø100)
  { name: "습식 알람밸브", spec: "100A, 10K, 그루브형", laborCode: "F02", factor: 1.66 },
  // 준비작동식 밸브(프리액션, Ø100)
  { name: "프리액션밸브(개방형)", spec: "100A, 1.0MPa", laborCode: "F02", factor: 2.01 },
  // 스프링클러 헤드
  { name: "스프링클러헤드", spec: "72℃, 표준반응형, 플러셔형", laborCode: "F02", factor: 0.092 },
  { name: "스프링클러헤드", spec: "72℃, 표준반응형, 플러셔형", laborCode: "F03", factor: 0.037 },
  // 8-1-1-1 Spot형 감지기(차동식·정온식·보상식, 노출형)
  { name: "차동식스포트형감지기", spec: "2종, 보통형", laborCode: "F01", factor: 0.13 },
  { name: "정온식스포트형감지기", spec: "특종, 보통형, 70℃", laborCode: "F01", factor: 0.13 },
  // 광전식연기감지기: Spot형 감지기 품셈으로 근사 적용(추정치)
  { name: "광전식연기감지기", spec: "2종", laborCode: "F01", factor: 0.13 },
  // 8-1-2 발신기(P-2, 보통형) / 경종 / 표시등
  { name: "발신기", spec: "P형 1종", laborCode: "F01", factor: 0.3 },
  { name: "경종", spec: "90dB", laborCode: "F01", factor: 0.15 },
  { name: "표시등", spec: "DC24V, 사각형", laborCode: "F01", factor: 0.2 },
  // 수동발신기세트(발신기+경종+표시등 통합형): 개별 품셈 합산(0.30+0.15+0.20)
  { name: "수동발신기세트", spec: "P형, 전강판", laborCode: "F01", factor: 0.65 },
  // 9-2-3 통로유도등(벽부형, 계단통로)
  { name: "통로유도등", spec: "LED, 소형, 60분용", laborCode: "F01", factor: 0.118 },
  // 9-3-1 비상조명등(벽부형)
  { name: "비상조명등", spec: "소화전내장형", laborCode: "F01", factor: 0.142 },
];

// ---------- 통신(telecom) 표준품셈 — 2026년 정보통신공사 표준품셈(한국정보통신산업연구원) ----------
// 노임단가 출처: 2026년 상반기 적용 정보통신부문 시중노임단가(한국정보통신공사협회 공표, 2026.1.1~8.31 적용).
export const DEFAULT_LABOR_RATES_TELECOM: LaborRate[] = [
  { code: "T01", name: "통신설비공", rate: 315528 },
  { code: "T02", name: "통신내선공", rate: 284880 },
  { code: "T03", name: "통신케이블공", rate: 436224 },
  { code: "T04", name: "보통인부", rate: 172068 },
];

// 출처: 2026년 정보통신공사 표준품셈 — 3-3 단자함, 4-1-2-2 광분배함(반), 4-3-1/4-3-3 꼬임케이블·MDF,
// 3-1-1 구내통신배관(가요전선관), 7-1 송수신기, 7-11-2 구내방송설비, 7-12-3 분배기및분기기, 8-1-1 네트워크설비,
// 8-2-1/8-2-2 홈네트워크(Wall PAD·비디오폰·현관공동기).
// 현관카메라·실링스피커·업무용무전기는 책에 동일 품목이 없어 인접 품목(현관공동기/스피커브라켓/이동국송수신기)을
// 근거로 한 근사치이며, 실제 현장 조건에 따라 조정이 필요합니다.
export const DEFAULT_PUMSEM_FACTORS_TELECOM: Array<{ name: string; spec: string; laborCode: string; factor: number }> = [
  // 3-3-2 배선반(단자함 100P 이하 기준)
  { name: "전화단자함(국선단자함)", spec: "40×100P, 매입연강", laborCode: "T03", factor: 0.69 },
  { name: "전화단자함(국선단자함)", spec: "40×100P, 매입연강", laborCode: "T04", factor: 0.49 },
  // 4-3-3 MDF 설치(공 철가기준, 열단위 → 100P당 근사)
  { name: "MDF(주배선반)", spec: "100P보호기 100P당", laborCode: "T01", factor: 1.55 },
  { name: "MDF(주배선반)", spec: "100P보호기 100P당", laborCode: "T04", factor: 0.78 },
  // 7-12-3-1 옥외형 분배기(분기기) 8분기기 기준
  { name: "TV분배기함", spec: "300×400mm, 매입연강", laborCode: "T01", factor: 0.38 },
  { name: "TV분배기함", spec: "300×400mm, 매입연강", laborCode: "T04", factor: 0.27 },
  // 8-2-1-2 세대 Wall PAD(기기매입박스점검+기기설치+터미널보드+장치별기능·종합시험 합산)
  { name: "월패드", spec: "일반형 10인치", laborCode: "T01", factor: 1.33 },
  { name: "월패드", spec: "일반형 10인치", laborCode: "T02", factor: 0.95 },
  // 8-2-2-6 비디오폰 설치
  { name: "비디오폰", spec: "표준형", laborCode: "T01", factor: 0.25 },
  // 8-2-1-7 현관공동기(벽부형) — 인터폰을 공동현관기 역할로 근사(기기매입박스점검+설치+IP세팅+기능시험 합산)
  { name: "인터폰", spec: "공동현관/경비실 연동", laborCode: "T01", factor: 1.16 },
  { name: "인터폰", spec: "공동현관/경비실 연동", laborCode: "T02", factor: 0.91 },
  // 현관카메라: 동일 품목이 없어 현관공동기 품셈의 일부를 근사 적용(추정치)
  { name: "현관카메라", spec: "컬러CCD", laborCode: "T01", factor: 0.2 },
  { name: "현관카메라", spec: "컬러CCD", laborCode: "T02", factor: 0.15 },
  // 4-1-2-2 광분배반(FDF)
  { name: "FDF(광단자함)", spec: "4Port", laborCode: "T01", factor: 0.23 },
  { name: "FDF(광단자함)", spec: "4Port", laborCode: "T04", factor: 0.23 },
  // 8-1-1 네트워크 설비(공통) 스위칭허브
  { name: "네트워크스위치(PoE)", spec: "1G SFP 2Port/UTP 8Port", laborCode: "T01", factor: 0.36 },
  { name: "네트워크스위치(PoE)", spec: "1G SFP 2Port/UTP 8Port", laborCode: "T04", factor: 0.22 },
  // 4-3-1 꼬임케이블 포설(UTP/STP/FTP 구내 4P, 10m당 0.15 → m당 환산)
  { name: "LAN케이블", spec: "Cat.5E, 4P", laborCode: "T03", factor: 0.015 },
  { name: "LAN케이블(고급)", spec: "Cat.6E, 4P", laborCode: "T03", factor: 0.015 },
  // 3-1-1 구내통신배관 — 금속제 가요 전선관(호칭22/28, 10m당 → m당 환산)
  { name: "통신용 플렉시블전선관", spec: "22mm", laborCode: "T02", factor: 0.059 },
  { name: "통신용 플렉시블전선관", spec: "28mm", laborCode: "T02", factor: 0.072 },
  // 실링스피커: 동일 품목이 없어 월스피커(스피커브라켓) 대비 간이설치로 근사(추정치)
  { name: "실링스피커", spec: "10W, 매입형", laborCode: "T01", factor: 0.1 },
  // 7-11-2-3 프로오디오 설비 스피커 브라켓(벽부형)
  { name: "월스피커", spec: "10W, 벽부형", laborCode: "T01", factor: 0.11 },
  // 7-11-2-1 비상방송설비 Power AMP(산업기사 시험품은 통신설비공으로 근사 합산)
  { name: "비상방송용 앰프", spec: "360W급, 8채널, 2U", laborCode: "T01", factor: 0.52 },
  // 업무용 무전기: 이동국 송수신기 품셈 대비 소형 휴대장비로 근사(추정치)
  { name: "업무용 무전기", spec: "UHF, 4.8W", laborCode: "T01", factor: 0.2 },
  { name: "업무용 무전기", spec: "UHF, 4.8W", laborCode: "T04", factor: 0.1 },
];

export const DEFAULT_LABOR_RATES_BY_DISCIPLINE: Partial<Record<Discipline, LaborRate[]>> = {
  telecom: DEFAULT_LABOR_RATES_TELECOM,
  fire: DEFAULT_LABOR_RATES_FIRE,
};

export const DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE: Partial<
  Record<Discipline, Array<{ name: string; spec: string; laborCode: string; factor: number }>>
> = {
  telecom: DEFAULT_PUMSEM_FACTORS_TELECOM,
  fire: DEFAULT_PUMSEM_FACTORS_FIRE,
};

export function fmt(n: number): string {
  if (!isFinite(n)) return "0";
  return Math.round(n).toLocaleString("ko-KR");
}
