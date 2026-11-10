// 기존 엑셀 내역서(.xlsx)에서 품명·규격·단위·수량(·단가)을 읽어 BOM 후보 행으로 만듭니다.
// 업체마다 양식이 달라서 (1) 헤더 행을 자동 탐지하고 (2) 소계/합계 행은 건너뛰며 (3) 수량 없는 제목 행은
// 공종(그룹)명으로 사용합니다. 서버 전용(exceljs)이므로 클라이언트에서는 lib/excelMatch.ts만 import하세요.
import ExcelJS from "exceljs";

export type ExcelRow = {
  sheet: string;
  rowNo: number;
  groupName: string;
  name: string;
  spec: string;
  unit: string;
  qty: number;
  origPrice: number | null; // 원본 파일의 (재료비) 단가 — 새 자재 등록과 합계 비교에 사용
};

export type ExcelSheetInfo = { name: string; rowCount: number; defaultInclude: boolean };
export type ExcelParseResult = { sheets: ExcelSheetInfo[]; rows: ExcelRow[]; warnings: string[] };
// 사용자가 화면에서 직접 지정하는 열 매핑(1부터 시작하는 열 번호, 0 = 없음). qty는 여러 열(층별 수량 등)을 합산할 수 있습니다.
export type ColumnMapping = { sheet: string; headerRow: number; name: number; spec: number; unit: number; qty: number[]; price: number };
export type SheetPreview = { name: string; rows: string[][]; totalRows: number };

const MAX_ROWS = 5000;
const HEADER_SCAN_ROWS = 40;
const MAX_COLS = 60;
// 일위대가·원가계산서·집계표 같은 보조 시트는 수량 열이 있어도 물량이 아니므로 기본 제외합니다.
const AUX_SHEET = /일위|대가|산출|집계|원가|총괄|표지|갑지|양식|단가표|노임|물가/;
const SUBTOTAL = /^(소계|합계|총계|계|누계|총합계|합계금액|공사비계|이하여백|이하빈칸|이하생략)/;

function cellText(v: ExcelJS.CellValue | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map((t) => t.text).join("").trim();
    if ("result" in o) return cellText(o.result as ExcelJS.CellValue);
    if (typeof o.text === "string") return o.text.trim();
  }
  return "";
}

function cellNum(v: ExcelJS.CellValue | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return parseFloat(s);
  }
  if (typeof v === "object" && "result" in (v as object)) return cellNum((v as { result?: ExcelJS.CellValue }).result);
  return null;
}

const compact = (s: string) => s.replace(/\s+/g, "");

type Cols = { name: number; spec: number; unit: number; qty: number; price: number };

function detectHeader(ws: ExcelJS.Worksheet): { headerRow: number; dataStart: number; cols: Cols } | null {
  const last = Math.min(ws.rowCount, HEADER_SCAN_ROWS);
  const colCount = Math.min(ws.columnCount, MAX_COLS);
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r);
    const heads: string[] = [];
    for (let c = 1; c <= colCount; c++) heads[c] = compact(cellText(row.getCell(c).value));

    const findFirst = (syns: string[], exclude: number[] = []) => {
      for (const syn of syns) {
        for (let c = 1; c <= colCount; c++) {
          if (!exclude.includes(c) && heads[c] && heads[c].startsWith(syn)) return c;
        }
      }
      return 0;
    };
    const qty = findFirst(["수량", "물량", "총수량"]);
    const name = findFirst(["품명", "품목", "명칭", "자재명", "재료명", "자재", "재료", "내역", "항목"]);
    if (!qty || !name) continue;
    const spec = findFirst(["규격", "사양", "모델"], [name]);
    const unit = findFirst(["단위"]);

    // 단가 열: 1단 헤더("재료비단가")이거나 2단 헤더(위 행 "재료비", 아래 행 "단가/금액")일 수 있습니다.
    let dataStart = r + 1;
    let price = 0;
    const pickPrice = (hs: string[]) => {
      const cands: number[] = [];
      for (let c = 1; c <= colCount; c++) if (hs[c] && hs[c].includes("단가")) cands.push(c);
      return (
        cands.find((c) => hs[c].includes("재료")) ??
        cands.find((c) => !/노무|경비|합계|노임/.test(hs[c])) ??
        cands[0] ??
        0
      );
    };
    price = pickPrice(heads);
    const next = ws.getRow(r + 1);
    const nextHeads: string[] = [];
    let nextNumeric = false;
    let nextHasLabel = false;
    for (let c = 1; c <= colCount; c++) {
      const v = next.getCell(c).value;
      nextHeads[c] = compact(cellText(v));
      if (cellNum(v) != null) nextNumeric = true;
      if (/^(단가|금액)/.test(nextHeads[c])) nextHasLabel = true;
    }
    if (nextHasLabel && !nextNumeric) {
      dataStart = r + 2;
      if (!price) price = pickPrice(nextHeads);
    }
    return { headerRow: r, dataStart, cols: { name, spec, unit, qty, price } };
  }
  return null;
}

type ReadCols = { name: number; spec: number; unit: number; qty: number[]; price: number };

function sumQty(row: ExcelJS.Row, cols: number[]): number | null {
  let total: number | null = null;
  for (const c of cols) {
    const n = cellNum(row.getCell(c).value);
    if (n != null) total = (total ?? 0) + n;
  }
  return total;
}

// 한 시트를 읽어 rows에 추가하고 추가된 행 수를 돌려줍니다.
function readSheet(ws: ExcelJS.Worksheet, cols: ReadCols, dataStart: number, rows: ExcelRow[], warnings: string[]): number {
  let group = "";
  let count = 0;
  for (let r = dataStart; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    let name = cellText(row.getCell(cols.name).value);
    let spec = cols.spec ? cellText(row.getCell(cols.spec).value) : "";
    const unit = cols.unit ? cellText(row.getCell(cols.unit).value) : "";
    const qty = sumQty(row, cols.qty);
    const price = cols.price ? cellNum(row.getCell(cols.price).value) : null;

    if (!name && spec) {
      name = spec;
      spec = "";
    }
    if (!name) continue;
    if (SUBTOTAL.test(compact(name).replace(/[[\]()<>]/g, ""))) continue;

    if (qty == null || qty <= 0) {
      // 수량·단가가 없는 행은 공종 제목으로 보고 이후 행의 그룹명으로 사용합니다.
      // 병합된 제목 행은 단위 칸에도 같은 텍스트가 복사돼 보이므로, 이름과 같으면 빈 칸으로 취급합니다.
      if (price == null && (!unit || unit === name)) group = name.slice(0, 60);
      continue;
    }
    if (rows.length >= MAX_ROWS) {
      warnings.push(`행이 ${MAX_ROWS}개를 넘어 이후 행은 가져오지 않았습니다.`);
      break;
    }
    rows.push({ sheet: ws.name, rowNo: r, groupName: group || ws.name.slice(0, 60), name, spec, unit, qty, origPrice: price });
    count++;
  }
  return count;
}

// 열 직접 지정 화면용: 각 시트의 앞부분을 그대로 보여줍니다(최대 6개 시트, 40행 × 14열).
export async function previewExcel(buf: ArrayBuffer): Promise<SheetPreview[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buf) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  return wb.worksheets.slice(0, 6).map((ws) => {
    const rows: string[][] = [];
    const last = Math.min(ws.rowCount, 40);
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const line: string[] = [];
      for (let c = 1; c <= 14; c++) line.push(cellText(row.getCell(c).value).slice(0, 40));
      rows.push(line);
    }
    return { name: ws.name, rows, totalRows: ws.rowCount };
  });
}

export async function parseExcelBoq(buf: ArrayBuffer, mapping?: ColumnMapping): Promise<ExcelParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buf) as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);

  const sheets: ExcelSheetInfo[] = [];
  const rows: ExcelRow[] = [];
  const warnings: string[] = [];

  if (mapping) {
    const ws = wb.worksheets.find((w) => w.name === mapping.sheet);
    if (!ws) {
      warnings.push("선택한 시트를 찾지 못했습니다.");
    } else {
      const count = readSheet(ws, { name: mapping.name, spec: mapping.spec, unit: mapping.unit, qty: mapping.qty, price: mapping.price }, mapping.headerRow + 1, rows, warnings);
      sheets.push({ name: ws.name, rowCount: count, defaultInclude: count > 0 });
      if (count === 0) warnings.push("지정한 열에서 가져올 행(수량이 0보다 큰 행)을 찾지 못했습니다. 품명·수량 열과 헤더 행을 다시 확인하세요.");
    }
    return { sheets, rows, warnings };
  }

  for (const ws of wb.worksheets) {
    const det = detectHeader(ws);
    if (!det) continue;
    const c = det.cols;
    const count = readSheet(ws, { name: c.name, spec: c.spec, unit: c.unit, qty: [c.qty], price: c.price }, det.dataStart, rows, warnings);
    sheets.push({ name: ws.name, rowCount: count, defaultInclude: count > 0 && !AUX_SHEET.test(ws.name) });
  }

  if (sheets.length === 0) {
    warnings.push("'품명'과 '수량' 열이 있는 표를 찾지 못했습니다. 첫 40행 안에 헤더(품명/규격/단위/수량)가 있어야 합니다.");
  }
  return { sheets, rows, warnings };
}
