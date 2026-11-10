import ExcelJS from "exceljs";
import { computeAll, DEFAULT_RATE_SETTINGS, type Material, type Pumsem, type LaborRate, type BomItem } from "../lib/calc";
import { buildPrintDocs } from "../lib/printDocs";
import { buildDocsWorkbook, SHEET_NAMES } from "../lib/excelDocs";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };

const M = (id: number, name: string, unit: string, price: number): Material => ({ id, category: "기구", name, spec: "규격" + id, unit, price } as Material);
const materials = [M(1, "분전함", "면", 438000), M(2, "차단기", "EA", 52700), M(3, "부스바", "식", 5000)];
const labor: LaborRate[] = [{ code: "L1", name: "내선전공", rate: 239171 }];
const pum: Pumsem[] = [{ materialId: 1, laborCode: "L1", factor: 0.199 }, { materialId: 2, laborCode: "L1", factor: 0.164 }];
const bom: BomItem[] = [{ groupName: "수량집계표", materialId: 1, qty: 2 }, { groupName: "수량집계표", materialId: 2, qty: 7 }, { groupName: "수량집계표", materialId: 3, qty: 1 }];
const rates = { ...DEFAULT_RATE_SETTINGS };
const result = computeAll(materials, pum, labor, rates, bom);
const docs = buildPrintDocs({ result, materials, laborRates: labor, rates });

(async () => {
  const wb = buildDocsWorkbook({ docs, result, projectName: "테스트 현장", priceBasis: "2026년 11월 물가정보", supplier: { company: "(주)테스트", regNo: "123-45-67890", address: "서울", bizType: "제조업", bizItem: "전기", tel: "02-1", fax: "02-2", manager: "홍길동", mobile: "010", email: "a@b.c" }, recipient: { client: "OO구청장", dept: "문화과", contact: "02-3", email: "x@y.z", date: "2026-11-10" }, notes: "유효기간 30일" });
  const buf = await wb.xlsx.writeBuffer();
  const re = new ExcelJS.Workbook();
  await re.xlsx.load(buf as ArrayBuffer);
  ok(re.worksheets.map((w) => w.name).join("|") === SHEET_NAMES.join("|"), "탭 7개가 7→1 순서·양식 이름대로");
  ok(re.worksheets.filter((w) => w.pageSetup.orientation === "landscape").length === 6 && re.getWorksheet(SHEET_NAMES[0])!.pageSetup.orientation === "portrait", "갑지만 세로, 나머지 가로");
  const g = re.getWorksheet(SHEET_NAMES[0])!;
  let finalCell = 0;
  g.eachRow((row) => row.eachCell((c) => { if (c.value === result.final && c.address.startsWith("F")) finalCell++; }));
  ok(finalCell >= 2, "갑지에 최종 합계(부가세 포함) 금액 표시");
  const s5 = re.getWorksheet(SHEET_NAMES[2])!;
  let totalRowSum = 0;
  s5.eachRow((row) => { if (row.getCell(1).value === "합 계") totalRowSum += Number(row.getCell(12).value ?? 0); });
  ok(Math.abs(totalRowSum - result.groupResults.reduce((s, x) => s + x.groupTotal, 0)) < 1, "내역서 합계 행 = 공종 합계");
  const s1 = re.getWorksheet(SHEET_NAMES[6])!;
  ok(s1.getCell("A6").value === "분전함" && s1.getCell("D6").value === 2, "수량집계표 품명·수량");
  if (fails) process.exit(1);
})();
