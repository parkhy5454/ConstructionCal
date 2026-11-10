// 제출용 문서 7종을 엑셀 7개 탭으로 만듭니다(웹의 "저장" 화면과 같은 내용·순서). 서버 전용(exceljs).
// 금액은 buildPrintDocs/ComputeResult의 값을 그대로 쓰므로 웹 화면·원가계산서와 합계가 일치합니다.
// 탭 순서는 사용자가 쓰던 양식과 같게 7 → 1 순서입니다. 1~6은 A4 가로, 7(갑지)은 A4 세로, 사방 여백 15mm, 가운데 정렬.
import ExcelJS from "exceljs";
import type { ComputeResult } from "./calc";
import { koreanMoney, costBasis, type PrintDocs } from "./printDocs";

export type Supplier = {
  company: string; regNo: string; address: string; bizType: string; bizItem: string;
  tel: string; fax: string; manager: string; mobile: string; email: string;
};
export type Recipient = { client: string; dept: string; contact: string; email: string; date: string };
export const EMPTY_SUPPLIER: Supplier = { company: "", regNo: "", address: "", bizType: "", bizItem: "", tel: "", fax: "", manager: "", mobile: "", email: "" };
export const EMPTY_RECIPIENT: Recipient = { client: "", dept: "", contact: "", email: "", date: "" };

const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E4" } };
const SUB_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F3F3" } };
const TOT_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECECEC" } };
const NUM = "#,##0";
const NUM1 = "#,##0.###";
const MARGIN_IN = 15 / 25.4;
const FONT = "맑은 고딕";

function setup(ws: ExcelJS.Worksheet, orientation: "landscape" | "portrait", widths: number[]) {
  ws.columns = widths.map((w) => ({ width: w }));
  ws.pageSetup = {
    paperSize: 9, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, verticalCentered: false,
    margins: { left: MARGIN_IN, right: MARGIN_IN, top: MARGIN_IN, bottom: MARGIN_IN, header: 0.2, footer: 0.2 },
  };
  ws.views = [{ showGridLines: false }];
}

function title(ws: ExcelJS.Worksheet, text: string, cols: number, sub: string) {
  ws.mergeCells(1, 1, 1, cols);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: FONT, size: 18, bold: true, underline: true };
  c.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 32;
  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { name: FONT, size: 10 };
  s.alignment = { horizontal: "left", vertical: "middle" };
}

type Opt = { bold?: boolean; fill?: ExcelJS.Fill; align?: "left" | "center" | "right"; fmt?: string; wrap?: boolean };
function put(ws: ExcelJS.Worksheet, r: number, c: number, v: ExcelJS.CellValue, o: Opt = {}) {
  const cell = ws.getCell(r, c);
  cell.value = v;
  cell.border = BORDER;
  cell.font = { name: FONT, size: 10, bold: o.bold };
  if (o.fill) cell.fill = o.fill;
  cell.alignment = { vertical: "middle", horizontal: o.align ?? (typeof v === "number" ? "right" : "left"), wrapText: o.wrap };
  if (o.fmt) cell.numFmt = o.fmt;
  return cell;
}
// 병합된 칸의 나머지 칸은 값을 쓰면 병합 대표 칸이 지워지므로 테두리·배경만 입힙니다.
function paint(ws: ExcelJS.Worksheet, r: number, c1: number, c2: number, fill?: ExcelJS.Fill) {
  for (let c = c1; c <= c2; c++) { const cell = ws.getCell(r, c); cell.border = BORDER; if (fill) cell.fill = fill; }
}
const head = (ws: ExcelJS.Worksheet, r: number, c: number, v: string) => put(ws, r, c, v, { bold: true, fill: HEAD_FILL, align: "center", wrap: true });
const nz = (n: number) => (Math.abs(n) < 1e-9 ? null : n);
const merge = (ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) => ws.mergeCells(r1, c1, r2, c2);

// 재료비/노무비/경비/합계 × 단가/금액 머리(2줄). 반환: 다음 행 번호
function moneyHead(ws: ExcelJS.Worksheet, r: number, lead: string[]): number {
  lead.forEach((t, i) => { head(ws, r, i + 1, t); head(ws, r + 1, i + 1, ""); merge(ws, r, i + 1, r + 1, i + 1); });
  const base = lead.length;
  ["재 료 비", "노 무 비", "경   비", "합   계"].forEach((t, k) => {
    const c = base + 1 + k * 2;
    head(ws, r, c, t); head(ws, r, c + 1, ""); merge(ws, r, c, r, c + 1);
    head(ws, r + 1, c, "단 가"); head(ws, r + 1, c + 1, "금 액");
  });
  head(ws, r, base + 9, "비 고"); head(ws, r + 1, base + 9, ""); merge(ws, r, base + 9, r + 1, base + 9);
  return r + 2;
}
const moneyW = [10, 12, 10, 12, 10, 12, 10, 12, 12]; // 단가/금액×4 + 비고

function sheet1(wb: ExcelJS.Workbook, name: string, docs: PrintDocs, sub: string) {
  const ws = wb.addWorksheet(name);
  setup(ws, "landscape", [30, 40, 8, 12, 16]);
  title(ws, "수 량 집 계 표", 5, sub);
  let r = 4;
  head(ws, r, 1, "품 목"); head(ws, r, 2, "규 격"); head(ws, r, 3, "단위"); head(ws, r, 4, "수 량"); head(ws, r, 5, "비 고");
  r++;
  for (const g of docs.quantity) {
    merge(ws, r, 1, r, 5); put(ws, r, 1, g.g, { bold: true, fill: SUB_FILL });
    paint(ws, r, 2, 5, SUB_FILL);
    r++;
    for (const x of g.rows) {
      put(ws, r, 1, x.name); put(ws, r, 2, x.spec); put(ws, r, 3, x.unit, { align: "center" }); put(ws, r, 4, Number(x.qty.toFixed(3)), { fmt: NUM1 }); put(ws, r, 5, "");
      r++;
    }
  }
  ws.pageSetup.printArea = `A1:E${r - 1}`;
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4 }];
}

function sheet2(wb: ExcelJS.Workbook, name: string, docs: PrintDocs, sub: string) {
  const ws = wb.addWorksheet(name);
  setup(ws, "landscape", [12, 28, 36, 8, 12, 12, 12, 14, 14]);
  title(ws, "단 가 대 비 표", 9, sub);
  let r = 4;
  ["번 호", "품 명", "규 격", "단위", "물가정보 Page", "A 사", "B 사", "적용단가", "비 고"].forEach((t, i) => head(ws, r, i + 1, t));
  ws.getRow(r).height = 30;
  r++;
  const row = (no: string, n: string, spec: string, unit: string, price: number) => {
    put(ws, r, 1, no, { align: "center" }); put(ws, r, 2, n); put(ws, r, 3, spec); put(ws, r, 4, unit, { align: "center" });
    put(ws, r, 5, ""); put(ws, r, 6, ""); put(ws, r, 7, ""); put(ws, r, 8, price, { fmt: NUM }); put(ws, r, 9, "");
    r++;
  };
  docs.priceTable.materials.forEach((m) => row(m.no, m.name, m.spec, m.unit, m.price));
  if (docs.priceTable.labors.length) r++;
  docs.priceTable.labors.forEach((m) => row(m.no, m.name, "", m.unit, m.price));
  ws.pageSetup.printArea = `A1:I${Math.max(r - 1, 5)}`;
}

function sheet3(wb: ExcelJS.Workbook, name: string, docs: PrintDocs, sub: string) {
  const ws = wb.addWorksheet(name);
  setup(ws, "landscape", [22, 30, 8, 9, ...moneyW]);
  title(ws, "일 위 대 가 표", 13, sub);
  let r = moneyHead(ws, 4, ["품 명", "규 격", "단위", "수 량"]);
  if (docs.ilwi.length === 0) { merge(ws, r, 1, r, 13); put(ws, r, 1, "노무(공수)가 반영된 품목이 없어 일위대가가 없습니다.", { align: "center" }); r++; }
  for (const b of docs.ilwi) {
    merge(ws, r, 1, r, 13); put(ws, r, 1, b.title, { bold: true, fill: SUB_FILL });
    paint(ws, r, 2, 13, SUB_FILL);
    r++;
    for (const l of b.lines) {
      put(ws, r, 1, l.name); put(ws, r, 2, l.spec); put(ws, r, 3, l.unit, { align: "center" }); put(ws, r, 4, l.qty, { fmt: NUM1 });
      put(ws, r, 5, nz(l.unitPrice.mat), { fmt: NUM }); put(ws, r, 6, nz(l.mat), { fmt: NUM });
      put(ws, r, 7, nz(l.unitPrice.labor), { fmt: NUM }); put(ws, r, 8, nz(l.labor), { fmt: NUM });
      put(ws, r, 9, nz(l.unitPrice.expense), { fmt: NUM }); put(ws, r, 10, nz(l.expense), { fmt: NUM });
      put(ws, r, 11, nz(l.unitPrice.mat + l.unitPrice.labor + l.unitPrice.expense), { fmt: NUM }); put(ws, r, 12, nz(l.mat + l.labor + l.expense), { fmt: NUM });
      put(ws, r, 13, "");
      r++;
    }
    put(ws, r, 1, "합 계", { bold: true, fill: TOT_FILL, align: "center" });
    for (let c = 2; c <= 13; c++) put(ws, r, c, null, { fill: TOT_FILL });
    put(ws, r, 6, nz(b.total.mat), { bold: true, fill: TOT_FILL, fmt: NUM }); put(ws, r, 8, nz(b.total.labor), { bold: true, fill: TOT_FILL, fmt: NUM });
    put(ws, r, 10, nz(b.total.expense), { bold: true, fill: TOT_FILL, fmt: NUM }); put(ws, r, 12, nz(b.total.sum), { bold: true, fill: TOT_FILL, fmt: NUM });
    r += 2;
  }
  ws.pageSetup.printArea = `A1:M${r - 1}`;
}

function sheet4(wb: ExcelJS.Workbook, name: string, docs: PrintDocs, sub: string) {
  const ws = wb.addWorksheet(name);
  setup(ws, "landscape", [11, 22, 30, 8, 8, ...moneyW]);
  title(ws, "일 위 대 가 표 목 록", 14, sub);
  let r = moneyHead(ws, 4, ["호 표", "품 명", "규 격", "단위", "수 량"]);
  for (const b of docs.ilwi) {
    put(ws, r, 1, `일위 ${b.no}호`, { align: "center" }); put(ws, r, 2, b.name); put(ws, r, 3, b.spec); put(ws, r, 4, b.unit, { align: "center" }); put(ws, r, 5, 1);
    const t = b.total;
    [t.mat, t.mat, t.labor, t.labor, t.expense, t.expense, t.sum, t.sum].forEach((v, i) => put(ws, r, 6 + i, nz(v), { fmt: NUM }));
    put(ws, r, 14, "");
    r++;
  }
  ws.pageSetup.printArea = `A1:N${Math.max(r - 1, 6)}`;
}

function sheet5(wb: ExcelJS.Workbook, name: string, docs: PrintDocs, sub: string) {
  const ws = wb.addWorksheet(name);
  setup(ws, "landscape", [22, 36, 7, 9, ...moneyW]);
  title(ws, "공 사 예 산 내 역 서", 13, sub);
  let r = moneyHead(ws, 4, ["품 명", "규 격", "단위", "수 량"]);
  for (const g of docs.detail) {
    merge(ws, r, 1, r, 13); put(ws, r, 1, g.g, { bold: true, fill: SUB_FILL });
    paint(ws, r, 2, 13, SUB_FILL);
    r++;
    for (const x of g.rows) {
      put(ws, r, 1, x.name); put(ws, r, 2, x.spec); put(ws, r, 3, x.unit, { align: "center" }); put(ws, r, 4, Number(x.qty.toFixed(3)), { fmt: NUM1 });
      [x.matUnit, x.matAmt, x.laborUnit, x.laborAmt, x.expUnit, x.expAmt, x.sumUnit, x.sumAmt].forEach((v, i) => put(ws, r, 5 + i, nz(Math.round(v)), { fmt: NUM }));
      put(ws, r, 13, x.note, { align: "center" });
      r++;
    }
    put(ws, r, 1, "합 계", { bold: true, fill: TOT_FILL, align: "center" });
    for (let c = 2; c <= 13; c++) put(ws, r, c, null, { fill: TOT_FILL });
    put(ws, r, 6, nz(g.total.mat), { bold: true, fill: TOT_FILL, fmt: NUM }); put(ws, r, 8, nz(g.total.labor), { bold: true, fill: TOT_FILL, fmt: NUM });
    put(ws, r, 10, nz(g.total.expense), { bold: true, fill: TOT_FILL, fmt: NUM }); put(ws, r, 12, nz(g.total.sum), { bold: true, fill: TOT_FILL, fmt: NUM });
    r += 2;
  }
  ws.getCell(r, 1).value = "* 노무비 단가는 표준품셈 공수 × 노임단가, 경비는 공구손료(노무비 기준)입니다. 품셈이 없는 품목은 재료비만 반영됩니다.";
  ws.getCell(r, 1).font = { name: FONT, size: 9, color: { argb: "FF666666" } };
  ws.pageSetup.printArea = `A1:M${r}`;
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 5 }];
}

function sheet6(wb: ExcelJS.Workbook, name: string, result: ComputeResult, sub: string) {
  const ws = wb.addWorksheet(name);
  setup(ws, "landscape", [22, 30, 8, 9, ...moneyW]);
  title(ws, "집 계 표", 13, sub);
  let r = moneyHead(ws, 4, ["품 명", "규 격", "단위", "수 량"]);
  for (const g of result.groupResults) {
    put(ws, r, 1, g.g); put(ws, r, 2, ""); put(ws, r, 3, "식", { align: "center" }); put(ws, r, 4, 1);
    [g.matTotal, g.matTotal, g.laborTotal, g.laborTotal, g.expenseTotal, g.expenseTotal, g.groupTotal, g.groupTotal].forEach((v, i) => put(ws, r, 5 + i, nz(v), { fmt: NUM }));
    put(ws, r, 13, "");
    r++;
  }
  for (let i = result.groupResults.length; i < 9; i++) { for (let c = 1; c <= 13; c++) put(ws, r, c, null); ws.getRow(r).height = 22; r++; }
  put(ws, r, 1, "합 계", { bold: true, fill: TOT_FILL, align: "center" });
  for (let c = 2; c <= 13; c++) put(ws, r, c, null, { fill: TOT_FILL });
  put(ws, r, 6, nz(result.sumMat), { bold: true, fill: TOT_FILL, fmt: NUM }); put(ws, r, 8, nz(result.sumLabor), { bold: true, fill: TOT_FILL, fmt: NUM });
  put(ws, r, 10, nz(result.sumExpense), { bold: true, fill: TOT_FILL, fmt: NUM }); put(ws, r, 12, nz(result.sumMat + result.sumLabor + result.sumExpense), { bold: true, fill: TOT_FILL, fmt: NUM });
  ws.pageSetup.printArea = `A1:M${r}`;
}

function sheet7(wb: ExcelJS.Workbook, name: string, result: ComputeResult, supplier: Supplier, recipient: Recipient, notes: string) {
  const ws = wb.addWorksheet(name);
  setup(ws, "portrait", [6, 18, 28, 10, 14, 18]);
  ws.mergeCells(1, 1, 1, 6);
  const t = ws.getCell(1, 1);
  t.value = "견  적  서"; t.font = { name: FONT, size: 22, bold: true }; t.alignment = { horizontal: "center", vertical: "middle" }; ws.getRow(1).height = 44;
  for (let c = 1; c <= 6; c++) ws.getCell(1, c).border = BORDER;

  // 수신(왼쪽 A:C) · 공급자(오른쪽 D:F) — 3~10행
  const sup: Array<[string, string, string?, string?]> = [
    ["상    호", supplier.company], ["등록번호", supplier.regNo], ["주    소", supplier.address], ["업    태", supplier.bizType], ["종    목", supplier.bizItem],
    ["전화번호", supplier.tel, "팩  스", supplier.fax], ["담 당 자", supplier.manager, "휴대폰", supplier.mobile], ["이 메 일", supplier.email],
  ];
  const left = [
    recipient.client ? `${recipient.client} 귀하` : "귀하", "", `수  신 : ${recipient.dept}`, `연락처 : ${recipient.contact}`, `E-mail : ${recipient.email}`, `발행일자 : ${recipient.date}`, "", "",
  ];
  sup.forEach((s, i) => {
    const r = 3 + i;
    ws.getRow(r).height = 22;
    merge(ws, r, 1, r, 3);
    put(ws, r, 1, left[i], { bold: i === 0, wrap: true });
    ws.getCell(r, 1).border = { left: THIN, right: THIN, top: i === 0 ? THIN : undefined, bottom: i === 7 ? THIN : undefined };
    ws.getCell(r, 1).font = { name: FONT, size: i === 0 ? 13 : 10, bold: i === 0 };
    put(ws, r, 4, s[0], { bold: true, align: "center", fill: HEAD_FILL });
    if (s[2]) { merge(ws, r, 5, r, 5); put(ws, r, 5, s[1]); put(ws, r, 6, `${s[2]} ${s[3] ?? ""}`.trim()); }
    else { merge(ws, r, 5, r, 6); put(ws, r, 5, s[1], { wrap: true }); paint(ws, r, 6, 6); }
  });

  // 합계 줄
  ws.getRow(11).height = 26;
  merge(ws, 11, 1, 11, 2); put(ws, 11, 1, "합 계 :", { bold: true });
  merge(ws, 11, 3, 11, 5); put(ws, 11, 3, `일금 ${koreanMoney(result.final)}원 정`, { bold: true });
  put(ws, 11, 6, result.final, { bold: true, fmt: '"₩"#,##0' });
  ws.getCell(11, 1).font = { name: FONT, size: 12, bold: true };
  ws.getCell(11, 3).font = { name: FONT, size: 12, bold: true };
  ws.getCell(11, 6).font = { name: FONT, size: 12, bold: true };

  ["No.", "품  명", "규격 및 모델", "수량", "단가", "금  액"].forEach((h, i) => head(ws, 12, i + 1, h));
  const b = costBasis(result);
  type R = { no?: string; name: string; spec?: string; unitAmt?: number; amt?: number; bold?: boolean };
  const rows: R[] = [
    { no: "1", name: "순공사비", amt: result.directCost },
    { name: "가. 직접 재료비", amt: result.sumMat },
    { name: "나. 노무비", amt: result.laborSubtotal },
    { name: "직접노무비", unitAmt: result.sumLabor },
    { name: "간접노무비", spec: b.indirect, unitAmt: result.indirectLabor },
    { name: "다. 경비", amt: result.expenseSubtotal },
    { name: "기타경비", spec: b.etc, unitAmt: result.etcExpense },
    { name: "산재보험료", spec: b.industrial, unitAmt: result.industrialIns },
    { name: "고용보험료", spec: b.employ, unitAmt: result.employIns },
    { no: "2", name: "일반 관리비", spec: b.gna, amt: result.gna },
    { name: "소   계", amt: result.subtotal },
    { no: "3", name: "이   윤", spec: b.profit, amt: result.profit },
    { name: "계", amt: result.beforeVat },
    { no: "4", name: "부가가치세", spec: b.vat, amt: result.vat },
    { name: "합   계", amt: result.final, bold: true },
  ];
  let r = 13;
  for (const x of rows) {
    ws.getRow(r).height = 22;
    put(ws, r, 1, x.no ?? "", { align: "center", bold: x.bold }); put(ws, r, 2, x.name, { bold: x.bold }); put(ws, r, 3, x.spec ?? "", { bold: x.bold });
    put(ws, r, 4, ""); put(ws, r, 5, x.unitAmt ?? null, { fmt: NUM }); put(ws, r, 6, x.amt ?? null, { fmt: NUM, bold: x.bold });
    r++;
  }
  const filler = notes.trim() ? 2 : 5;
  put(ws, r, 1, ""); put(ws, r, 2, "비  고", { bold: true }); merge(ws, r, 3, r, 6); put(ws, r, 3, notes.trim(), { wrap: true });
  paint(ws, r, 4, 6);
  ws.getRow(r).height = notes.trim() ? 44 : 22;
  r++;
  for (let i = 0; i < filler; i++) { for (let c = 1; c <= 6; c++) put(ws, r, c, null); ws.getRow(r).height = 22; r++; }
  // 바깥 굵은 테두리
  const lastRow = r - 1;
  for (let rr = 1; rr <= lastRow; rr++) for (let c = 1; c <= 6; c++) {
    const cell = ws.getCell(rr, c);
    const b0 = { ...(cell.border ?? {}) } as Partial<ExcelJS.Borders>;
    const med: Partial<ExcelJS.Border> = { style: "medium", color: { argb: "FF000000" } };
    if (rr === 1) b0.top = med;
    if (rr === lastRow) b0.bottom = med;
    if (c === 1) b0.left = med;
    if (c === 6) b0.right = med;
    cell.border = b0;
  }
  ws.pageSetup.printArea = `A1:F${lastRow}`;
}

export const SHEET_NAMES = ["7. 갑지(견적서)", "6. 집계표", "5. 공사 예산 내역서", "4. 일위대가 목록", "3. 일위대가표", "2. 단가대비표", "1. 수량집계표"];

export function buildDocsWorkbook(args: {
  docs: PrintDocs; result: ComputeResult; projectName: string; priceBasis?: string;
  supplier?: Supplier; recipient?: Recipient; notes?: string;
}): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ConCal";
  wb.created = new Date();
  const sub = `공사명: ${args.projectName}${args.priceBasis ? `    (단가 기준: ${args.priceBasis})` : ""}`;
  sheet7(wb, SHEET_NAMES[0], args.result, args.supplier ?? EMPTY_SUPPLIER, args.recipient ?? EMPTY_RECIPIENT, args.notes ?? "");
  sheet6(wb, SHEET_NAMES[1], args.result, sub);
  sheet5(wb, SHEET_NAMES[2], args.docs, sub);
  sheet4(wb, SHEET_NAMES[3], args.docs, sub);
  sheet3(wb, SHEET_NAMES[4], args.docs, sub);
  sheet2(wb, SHEET_NAMES[5], args.docs, sub);
  sheet1(wb, SHEET_NAMES[6], args.docs, sub);
  return wb;
}
