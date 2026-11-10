// 글자가 들어 있는 PDF(수량집계표·공사예산내역서 등)에서 품명·규격·단위·수량(·재료비 단가)을 읽습니다.
// PDF에는 "표"가 없고 글자의 위치만 있으므로 (1) 같은 높이의 글자를 한 줄로 묶고 (2) 간격이 벌어진 곳에서 칸을 나눈 뒤
// (3) 헤더 행(품명·수량)의 가로 위치를 기준으로 각 칸을 열에 배정합니다. 스캔본(이미지)은 글자가 없어 읽을 수 없습니다.
// 서버 전용입니다(unpdf). 결과 형식은 엑셀 가져오기와 같아 같은 확인 화면을 씁니다.
import { getDocumentProxy } from "unpdf";
import type { ExcelRow, ExcelSheetInfo, ExcelParseResult } from "./excelImport";

const MAX_PAGES = 60;
const MAX_ROWS = 5000;
const SUBTOTAL = /^(소계|합계|총계|계|누계|총합계|합계금액|공사비계|이하여백|이하빈칸|이하생략)/;
const AUX_TITLE = /일위대가|단가대비|원가계산|총괄|표지|노임|갑지/;

type Cell = { x0: number; x1: number; text: string; merged?: boolean };
type Line = { y: number; cells: Cell[] };
type Col = { name: number; spec: number; unit: number; qty: number; price: number; note: number }; // 각 열의 가로 중심(없으면 -1)

const compact = (s: string) => s.replace(/\s+/g, "");
const toNum = (s: string): number | null => {
  const t = s.replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
};

// 한 쪽의 글자들을 줄(세로 위치 기준) → 칸(가로 간격 기준)으로 묶습니다.
function toLines(items: Array<{ str: string; transform: number[]; width: number }>): Line[] {
  const raw = items.filter((it) => it.str.trim() !== "").map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }));
  raw.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Array<{ y: number; its: typeof raw }> = [];
  for (const it of raw) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - it.y) <= 3) last.its.push(it);
    else rows.push({ y: it.y, its: [it] });
  }
  return rows.map((r) => {
    const its = r.its.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const it of its) {
      const prev = cells[cells.length - 1];
      if (prev && it.x - prev.x1 < 5) { prev.text += (it.x - prev.x1 > 1.5 ? " " : "") + it.str.trim(); prev.x1 = it.x + it.w; }
      else cells.push({ x0: it.x, x1: it.x + it.w, text: it.str.trim() });
    }
    return { y: r.y, cells };
  });
}

const center = (c: Cell) => (c.x0 + c.x1) / 2;

// 제목 칸이 "품   목"처럼 글자 사이를 띄워 쓴 경우 글자마다 칸이 나뉘므로, 짧은 칸끼리 이어 붙입니다(헤더 판별용).
function mergeShort(cells: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (const c of cells) {
    const prev = out[out.length - 1];
    if (prev && compact(c.text).length === 1 && (compact(prev.text).length === 1 || prev.merged) && c.x0 - prev.x1 < 25) {
      prev.text += c.text; prev.x1 = c.x1; prev.merged = true;
    } else out.push({ ...c });
  }
  return out;
}

const noteOf = (cells: Cell[]) => { const c = cells.find((x) => compact(x.text).startsWith("비고")); return c ? center(c) : -1; };

function findHeader(lines: Line[]): { idx: number; col: Col; dataStart: number } | null {
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const cells = mergeShort(lines[i].cells);
    const find = (words: string[], from = 0) => cells.findIndex((c, k) => k >= from && words.some((w) => compact(c.text).startsWith(w)));
    const q = find(["수량", "물량"]);
    const n = find(["품명", "품목", "명칭", "자재", "재료명", "내역", "항목"]);
    if (q < 0 || n < 0) continue;
    const s = find(["규격", "사양", "모델"]);
    const u = find(["단위"]);
    const p = find(["단가"]);
    let dataStart = i + 1;
    // 2단 헤더: 윗줄 "재료비", 아랫줄 "단가/금액" → 아랫줄의 첫 "단가"를 재료비 단가로 봅니다.
    const next = lines[i + 1] ? { ...lines[i + 1], cells: mergeShort(lines[i + 1].cells) } : undefined;
    if (p < 0 && next && next.cells.some((c) => /^(단가|금액)/.test(compact(c.text))) && !next.cells.some((c) => toNum(c.text) !== null)) {
      const k = next.cells.findIndex((c) => compact(c.text).startsWith("단가"));
      dataStart = i + 2;
      return { idx: i, col: { name: center(cells[n]), spec: s >= 0 ? center(cells[s]) : -1, unit: u >= 0 ? center(cells[u]) : -1, qty: center(cells[q]), price: k >= 0 ? center(next.cells[k]) : -1, note: noteOf(cells) }, dataStart };
    }
    return { idx: i, col: { name: center(cells[n]), spec: s >= 0 ? center(cells[s]) : -1, unit: u >= 0 ? center(cells[u]) : -1, qty: center(cells[q]), price: p >= 0 ? center(cells[p]) : -1, note: noteOf(cells) }, dataStart };
  }
  return null;
}

// 칸을 열에 배정합니다.
// - 숫자 칸(수량·단가): 글자 중심이 해당 열 헤더 중심에서 가까울 때만 그 열로(오른쪽의 금액·노무비 칸 등은 무시).
// - 글자 칸(품명·규격·단위): 데이터의 시작 위치(x)가 모이는 곳을 세어 왼쪽부터 품명·규격·단위 순으로 맞춥니다.
//   (헤더는 열 가운데에 쓰이고 데이터는 왼쪽 정렬이라 헤더 위치로 직접 비교하면 어긋나기 때문)
//   세어진 덩어리 수가 열 수와 다르면 헤더 중심 사이의 중간점으로 대신 나눕니다.
const NUM_TOL = 28;

function textClusters(cells: Cell[]): number[] {
  const xs = cells.filter((c) => toNum(c.text) === null).map((c) => c.x0).sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - last[last.length - 1] <= 6) last.push(x); else clusters.push([x]);
  }
  // 한두 번만 나온 덩어리는 줄바꿈된 글자 등 잡음으로 보고 제외
  return clusters.filter((c) => c.length >= Math.max(2, Math.floor(xs.length / 30))).map((c) => c.reduce((s, v) => s + v, 0) / c.length);
}

function makeAssigner(col: Col, dataCells: Cell[]) {
  const textKeys = (["name", "spec", "unit"] as const).filter((k) => col[k] >= 0).sort((a, b) => col[a] - col[b]);
  const noteB = col.note >= 0 ? (Math.max(col.name, col.spec, col.unit, col.qty, col.price) + col.note) / 2 : Infinity;
  const clusters = textClusters(dataCells.filter((c) => c.x0 <= noteB));
  const byCluster = clusters.length === textKeys.length;
  // 비고 열(헤더가 있으면)의 글자는 품명·규격·단위가 아니므로 무시합니다.
  const maxKey = Math.max(col.name, col.spec, col.unit, col.qty, col.price);
  const noteBound = col.note >= 0 ? (maxKey + col.note) / 2 : Infinity;
  return (cell: Cell): keyof Col | null => {
    if (toNum(cell.text) !== null) {
      const c = center(cell);
      const cands = (["qty", "price"] as const).filter((k) => col[k] >= 0);
      let best: keyof Col | null = null, bd = Infinity;
      for (const k of cands) { const d = Math.abs(c - col[k]); if (d < bd) { bd = d; best = k; } }
      return best && bd <= NUM_TOL ? best : null;
    }
    if (cell.x0 > noteBound) return null;
    if (byCluster) {
      let bi = 0, bd = Infinity;
      clusters.forEach((x, i) => { const d = Math.abs(cell.x0 - x); if (d < bd) { bd = d; bi = i; } });
      return textKeys[bi];
    }
    const sorted = textKeys;
    for (let i = 0; i < sorted.length; i++) {
      const hi = i === sorted.length - 1 ? Infinity : (col[sorted[i]] + col[sorted[i + 1]]) / 2;
      if (cell.x0 < hi) return sorted[i];
    }
    return sorted[sorted.length - 1] ?? null;
  };
}

export type PdfParseResult = ExcelParseResult & { rawText: string; hasText: boolean };

export type TextItem = { str: string; transform: number[]; width: number };

export async function parsePdfBoq(buf: ArrayBuffer): Promise<PdfParseResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const pages: TextItem[][] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, MAX_PAGES); p++) {
    const page = await pdf.getPage(p);
    pages.push((await page.getTextContent()).items as TextItem[]);
  }
  return parsePages(pages, pdf.numPages);
}

// 글자 위치 목록(쪽별)에서 표를 복원합니다. PDF 읽기와 분리해 두어 테스트할 수 있습니다.
export function parsePages(pageItems: TextItem[][], numPages: number): PdfParseResult {
  const rows: ExcelRow[] = [];
  const sheets: ExcelSheetInfo[] = [];
  const warnings: string[] = [];
  const rawLines: string[] = [];
  let hasText = false;
  let layout: Col | null = null;
  let group = "";

  if (numPages > MAX_PAGES) warnings.push(`PDF가 ${MAX_PAGES}쪽을 넘어 앞 ${MAX_PAGES}쪽만 읽었습니다.`);

  for (let p = 1; p <= pageItems.length; p++) {
    const lines = toLines(pageItems[p - 1]);
    if (lines.length > 0) hasText = true;
    for (const l of lines) rawLines.push(l.cells.map((c) => c.text).join("\t"));
    rawLines.push("");

    const title = compact(lines[0]?.cells.map((c) => c.text).join("") ?? "");
    const head = findHeader(lines);
    if (head) layout = head.col;
    if (!layout) continue;
    const col = layout;
    const start = head ? head.dataStart : 0;
    const aux = AUX_TITLE.test(title) || (/집계/.test(title) && !/수량|물량/.test(title));
    let count = 0;
    let prev: ExcelRow | null = null;

    const assignCell = makeAssigner(col, lines.slice(start).flatMap((l) => l.cells));
    for (let li = start; li < lines.length; li++) {
      const line = lines[li];
      const f: Partial<Record<keyof Col, string>> = {};
      for (const c of line.cells) {
        const k = assignCell(c);
        if (!k) continue;
        f[k] = f[k] ? `${f[k]} ${c.text}` : c.text;
      }
      const name = (f.name ?? "").trim();
      const spec = (f.spec ?? "").trim();
      const unit = (f.unit ?? "").trim();
      const qty = f.qty !== undefined ? toNum(f.qty) : null;
      const price = f.price !== undefined ? toNum(f.price) : null;

      if (!name && spec && qty == null && prev) { prev.spec = `${prev.spec} ${spec}`.trim(); continue; } // 규격이 두 줄로 나뉜 경우
      if (!name) continue;
      if (SUBTOTAL.test(compact(name).replace(/[[\]()<>]/g, ""))) continue;
      if (qty == null || qty <= 0) {
        // 이름 칸에만 글자가 있는 줄은 공종 제목
        if (line.cells.length === 1 || (!spec && !unit && price == null)) group = name.slice(0, 60);
        continue;
      }
      if (rows.length >= MAX_ROWS) { warnings.push(`행이 ${MAX_ROWS}개를 넘어 이후 행은 가져오지 않았습니다.`); break; }
      const row: ExcelRow = { sheet: `PDF ${p}쪽`, rowNo: li + 1, groupName: group || `PDF ${p}쪽`, name, spec, unit, qty, origPrice: price };
      rows.push(row);
      prev = row;
      count++;
    }
    if (count > 0) sheets.push({ name: `PDF ${p}쪽${title ? ` (${title.slice(0, 14)})` : ""}`, rowCount: count, defaultInclude: !aux });
    // 쪽 이름에 제목이 붙었으므로 행의 sheet 값도 맞춥니다
    if (count > 0) {
      const nm = sheets[sheets.length - 1].name;
      for (const r of rows) if (r.sheet === `PDF ${p}쪽`) r.sheet = nm;
    }
  }

  if (!hasText) warnings.push("이 PDF에는 읽을 수 있는 글자가 없습니다(스캔본이나 사진 PDF일 수 있습니다). 글자가 들어 있는 PDF나 엑셀 파일을 올려주세요.");
  else if (sheets.length === 0) warnings.push("'품명'과 '수량' 제목이 있는 표를 찾지 못했습니다. 아래 붙여넣기 칸에 PDF에서 읽은 글자를 넣어 두었으니 고쳐서 분석해 보세요.");
  return { sheets, rows, warnings, rawText: rawLines.join("\n").slice(0, 200_000), hasText };
}
