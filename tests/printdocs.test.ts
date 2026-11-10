import { computeAll, DEFAULT_RATE_SETTINGS, type Material, type Pumsem, type LaborRate, type BomItem } from "../lib/calc";
import { buildPrintDocs, koreanMoney, costBasis } from "../lib/printDocs";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

ok(koreanMoney(18700000) === "일천팔백칠십만", "한글 금액 18,700,000 → 일천팔백칠십만");
ok(koreanMoney(10231472) === "일천이십삼만일천사백칠십이", "한글 금액 10,231,472");
ok(koreanMoney(100000000) === "일억" && koreanMoney(0) === "영" && koreanMoney(1_0000_0001) === "일억일", "한글 금액 경계값(일억/영/일억일)");

const M = (id: number, name: string, unit: string, price: number): Material => ({ id, category: "기구", name, spec: "규격" + id, unit, price } as Material);
const materials = [M(1, "분전함", "면", 438000), M(2, "차단기", "EA", 52700), M(3, "부스바", "식", 5000)];
const labor: LaborRate[] = [{ code: "L1", name: "내선전공", rate: 239171 }, { code: "L2", name: "통신설비공", rate: 248060 }];
const pum: Pumsem[] = [{ materialId: 1, laborCode: "L1", factor: 0.199 }, { materialId: 1, laborCode: "L2", factor: 0.05 }, { materialId: 2, laborCode: "L2", factor: 0.164 }];
const bom: BomItem[] = [
  { groupName: "A", materialId: 3, qty: 1 }, { groupName: "A", materialId: 1, qty: 2 }, { groupName: "B", materialId: 2, qty: 7 }, { groupName: "B", materialId: 1, qty: 1 },
];
const rates = { ...DEFAULT_RATE_SETTINGS };
const result = computeAll(materials, pum, labor, rates, bom, [{ id: "s", label: "고소", percent: 20, group: "B" }]);
const d = buildPrintDocs({ result, materials, laborRates: labor, rates });

ok(d.matNo.get(3) === 1 && d.matNo.get(1) === 2 && d.matNo.get(2) === 3, "자재 번호는 처음 나온 순서(부스바1, 분전함2, 차단기3)");
ok(!d.ilwiNo.has(3) && d.ilwiNo.get(1) === 1 && d.ilwiNo.get(2) === 2, "공수가 있는 자재만 일위 번호(부스바 제외)");
ok(d.ilwi.length === 2, "일위대가 2건");
const b1 = d.ilwi[0];
ok(b1.lines.length === 4 && b1.lines[1].name === "내선전공" && b1.lines[2].name === "통신설비공" && b1.lines[3].name === "공구손료", "일위대가: 재료 + 직종별 노무 2줄 + 공구손료");
const L1 = 0.199 * 239171 + 0.05 * 248060;
ok(near(b1.total.labor, L1) && near(b1.total.expense, L1 * 0.03) && near(b1.total.sum, 438000 + L1 * 1.03), "일위 1호 합계 = 재료 + 노무 + 공구손료");
ok(d.priceTable.materials.length === 3 && d.priceTable.labors.length === 2 && d.priceTable.labors[0].no === "노임 1호", "단가대비표: 자재 3 + 노임 2(사용 직종만)");

// 내역서 합계는 기존 계산 결과(원가계산서)와 정확히 일치해야 함
let mat = 0, lab = 0, exp = 0;
for (const g of d.detail) {
  const rowMat = g.rows.reduce((s, r) => s + r.matAmt, 0);
  const rowLab = g.rows.reduce((s, r) => s + r.laborAmt, 0);
  const rowExp = g.rows.reduce((s, r) => s + r.expAmt, 0);
  const gr = result.groupResults.find((x) => x.g === g.g)!;
  ok(near(rowMat, gr.matTotal) && near(rowLab, gr.laborTotal) && near(rowExp, gr.expenseTotal), `내역서 ${g.g}: 행 합계가 공종 합계와 일치(할증·부속재 포함)`);
  mat += g.total.mat; lab += g.total.labor; exp += g.total.expense;
}
ok(near(mat, result.sumMat) && near(lab, result.sumLabor) && near(exp, result.sumExpense), "내역서 전체 합계 = 계산 결과 합계");
const bRows = d.detail.find((g) => g.g === "B")!.rows;
ok(bRows.some((r) => r.name === "노무비 할증" && r.extra), "할증이 있는 공종에는 '노무비 할증' 행 표시");
ok(d.detail[0].rows.find((r) => r.name === "부스바")!.note === "자재 1호" && d.detail[0].rows.find((r) => r.name === "분전함")!.note === "일위 1호", "비고에 일위/자재 번호 표시");

const cb = costBasis(result);
ok(cb.indirect === "직접노무비의 8%" && cb.etc === "가+나의 5.49%" && cb.industrial === "나의 3.73%" && cb.gna === "순공사비의 6% 이내" && cb.profit === "나+다+2의 15%" && cb.vat === "계의 10%", "견적서 산출 근거 문구가 설정 비율과 일치");

const empty = buildPrintDocs({ result: computeAll(materials, pum, labor, rates, []), materials, laborRates: labor, rates });
ok(empty.ilwi.length === 0 && empty.detail.length === 0 && empty.quantity.length === 0, "물량이 없어도 오류 없이 빈 문서");
if (fails) process.exit(1);
