import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/currentUser";
import { getMaterials, getLaborRates, getPumsem, getRateSettings, getProjectBom, getProjectOwned } from "@/lib/estimateData";
import { computeAll, type Discipline } from "@/lib/calc";

export const runtime = "nodejs";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3EFE8" } };
const THIN = { style: "thin" as const, color: { argb: "FFCCCCCC" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const WON = "#,##0";

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, size: 10 };
    cell.border = BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const project = await getProjectOwned(user.id, id);
  if (!project) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  const discipline = project.discipline as Discipline;

  const [mats, labor, pum, rates, bom] = await Promise.all([
    getMaterials(user.id, discipline),
    getLaborRates(user.id, discipline),
    getPumsem(user.id, discipline),
    getRateSettings(user.id, discipline),
    getProjectBom(id),
  ]);
  const result = computeAll(mats, pum, labor, rates, bom);
  const matById = new Map(mats.map((m) => [m.id, m]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "ConCal";
  wb.created = new Date();

  // ---------- 1) BOM 입력 ----------
  const bomSheet = wb.addWorksheet("BOM입력");
  bomSheet.columns = [
    { header: "공종", key: "g", width: 16 },
    { header: "품명", key: "name", width: 28 },
    { header: "규격", key: "spec", width: 24 },
    { header: "단위", key: "unit", width: 8 },
    { header: "수량", key: "qty", width: 10 },
    { header: "재료비단가", key: "price", width: 12 },
    { header: "재료비", key: "amt", width: 14 },
  ];
  styleHeaderRow(bomSheet.getRow(1));
  bom.forEach((b) => {
    const mat = matById.get(b.materialId);
    const r = bomSheet.addRow({
      g: b.groupName, name: mat?.name ?? "", spec: mat?.spec ?? "", unit: mat?.unit ?? "",
      qty: b.qty, price: mat?.price ?? 0, amt: (mat?.price ?? 0) * b.qty,
    });
    r.getCell("price").numFmt = WON;
    r.getCell("amt").numFmt = WON;
    r.eachCell((c) => (c.border = BORDER));
  });

  // ---------- 2) 내역서 ----------
  const sheet = wb.addWorksheet("내역서");
  sheet.columns = [
    { header: "구분", key: "g", width: 10 },
    { header: "품명 / 규격", key: "name", width: 34 },
    { header: "단위", key: "unit", width: 8 },
    { header: "수량", key: "qty", width: 10 },
    { header: "재료비", key: "mat", width: 14 },
    { header: "노무비", key: "labor", width: 14 },
    { header: "경비", key: "exp", width: 14 },
    { header: "계", key: "sum", width: 15 },
  ];
  styleHeaderRow(sheet.getRow(1));
  result.groupResults.forEach((g) => {
    const gRow = sheet.addRow({ g: g.g });
    sheet.mergeCells(gRow.number, 1, gRow.number, 8);
    gRow.getCell(1).font = { bold: true };
    gRow.getCell(1).fill = TOTAL_FILL;

    g.items.forEach((it) => {
      const r = sheet.addRow({ name: `${it.name} ${it.spec}`, unit: "", qty: it.qty, mat: it.matAmt, labor: 0, exp: 0, sum: it.matAmt });
      ["mat", "labor", "exp", "sum"].forEach((k) => (r.getCell(k).numFmt = WON));
      r.eachCell((c) => (c.border = BORDER));
    });
    const extraRows: Array<[string, string, number, number, number, number]> = [
      ["배관 부속재", "식", 1, g.accessory, 0, 0],
      ["소모 잡자재", "식", 1, g.consumable, 0, 0],
      ["노무비 (공수)", "인", Number(g.laborHeadcount.toFixed(2)), 0, g.laborAmt, 0],
      ["공구손료", "식", 1, 0, 0, g.toolLoss],
    ];
    extraRows.forEach(([name, unit, qty, mat, lab, exp]) => {
      const r = sheet.addRow({ name, unit, qty, mat, labor: lab, exp, sum: mat + lab + exp });
      ["mat", "labor", "exp", "sum"].forEach((k) => (r.getCell(k).numFmt = WON));
      r.getCell("name").font = { italic: true, color: { argb: "FF888888" } };
      r.eachCell((c) => (c.border = BORDER));
    });
    const totalRow = sheet.addRow({ name: "합 계", mat: g.matTotal, labor: g.laborTotal, exp: g.expenseTotal, sum: g.groupTotal });
    totalRow.eachCell((c) => { c.fill = TOTAL_FILL; c.font = { bold: true }; c.border = BORDER; });
    ["mat", "labor", "exp", "sum"].forEach((k) => (totalRow.getCell(k).numFmt = WON));
  });

  // ---------- 3) 총괄표 ----------
  const sum = wb.addWorksheet("총괄표");
  sum.columns = [
    { header: "공종", key: "g", width: 18 },
    { header: "재료비", key: "mat", width: 16 },
    { header: "노무비", key: "labor", width: 16 },
    { header: "경비", key: "exp", width: 16 },
    { header: "계", key: "sum", width: 16 },
  ];
  styleHeaderRow(sum.getRow(1));
  result.groupResults.forEach((g) => {
    const r = sum.addRow({ g: g.g, mat: g.matTotal, labor: g.laborTotal, exp: g.expenseTotal, sum: g.groupTotal });
    ["mat", "labor", "exp", "sum"].forEach((k) => (r.getCell(k).numFmt = WON));
    r.eachCell((c) => (c.border = BORDER));
  });
  const sumTotal = sum.addRow({ g: "합 계", mat: result.sumMat, labor: result.sumLabor, exp: result.sumExpense, sum: result.sumMat + result.sumLabor + result.sumExpense });
  sumTotal.eachCell((c) => { c.fill = TOTAL_FILL; c.font = { bold: true }; c.border = BORDER; });
  ["mat", "labor", "exp", "sum"].forEach((k) => (sumTotal.getCell(k).numFmt = WON));

  // ---------- 4) 원가계산서 ----------
  const won = wb.addWorksheet("원가계산서");
  won.columns = [
    { header: "구분", key: "label", width: 26 },
    { header: "산출식", key: "formula", width: 30 },
    { header: "금액", key: "amt", width: 18 },
  ];
  styleHeaderRow(won.getRow(1));
  const rows: Array<[string, string, number, boolean]> = [
    ["가. 직접재료비", "", result.sumMat, false],
    ["나. 직접노무비", "", result.sumLabor, false],
    ["   간접노무비", "나 × 비율", result.indirectLabor, false],
    ["노무비 소계", "나 + 간접노무비", result.laborSubtotal, true],
    ["다. 기타경비", "(가+나) × 비율", result.etcExpense, false],
    ["   산재보험료", "노무비 × 비율", result.industrialIns, false],
    ["   고용보험료", "노무비 × 비율", result.employIns, false],
    ["경비 소계", "", result.expenseSubtotal, true],
    ["순공사비", "가+나+다", result.directCost, true],
    ["일반관리비", "순공사비 × 비율", result.gna, false],
    ["소계", "순공사비+일반관리비", result.subtotal, true],
    ["이윤", "(노무비+경비+일반관리비) × 비율", result.profit, false],
    ["계", "소계+이윤", result.beforeVat, true],
    ["부가가치세", "계 × 비율", result.vat, false],
    ["합 계 (최종 견적금액)", "계+부가세", result.final, true],
  ];
  rows.forEach(([label, formula, amt, bold]) => {
    const r = won.addRow({ label, formula, amt });
    r.getCell("amt").numFmt = WON;
    r.eachCell((c) => (c.border = BORDER));
    if (bold) {
      r.eachCell((c) => { c.font = { bold: true }; c.fill = TOTAL_FILL; });
    }
  });

  const buf = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${project.name}_공사예산내역서.xlsx`);
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
