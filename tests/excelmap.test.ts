import ExcelJS from "exceljs";
import { parseExcelBoq, previewExcel } from "../lib/excelImport";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };

async function buf(build: (wb: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const b = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return b;
}

async function main() {
  // 1) '물량' 열 이름도 자동 인식
  const a = await buf((wb) => {
    const ws = wb.addWorksheet("물량표");
    ws.addRow(["품 명", "규격", "단위", "물량"]);
    ws.addRow(["전선관", "16C", "m", 120]);
    ws.addRow(["콘센트", "2구", "개", 8]);
  });
  const ra = await parseExcelBoq(a);
  ok(ra.rows.length === 2 && ra.rows[0].qty === 120 && ra.rows[0].name === "전선관", "'물량' 헤더 자동 인식(공백 있는 '품 명' 포함)");

  // 2) 층별 수량 열 — 헤더에 '수량'이 없어 자동 인식 실패 → 열 직접 지정으로 합산
  const b = await buf((wb) => {
    const ws = wb.addWorksheet("산출");
    ws.addRow(["공사 물량 산출표"]);
    ws.addRow([]);
    ws.addRow(["자재", "규격", "단위", "1층", "2층", "3층"]);
    ws.addRow(["케이블", "HFIX 2.5", "m", 100, 50, ""]);
    ws.addRow(["스위치", "1구", "개", 4, 4, 2]);
    ws.addRow(["소계", "", "", 104, 54, 2]);
    ws.addRow(["빈품목", "", "개", "", "", ""]);
  });
  const rb = await parseExcelBoq(b);
  ok(rb.rows.length === 0 && rb.sheets.length === 0, "수량 헤더가 없으면 자동 인식은 실패(직접 지정 필요)");
  const prev = await previewExcel(b);
  ok(prev.length === 1 && prev[0].rows[2][0] === "자재" && prev[0].rows[0].length === 14, "미리보기에 시트 앞부분이 그대로 나옴");
  const rm = await parseExcelBoq(b, { sheet: "산출", headerRow: 3, name: 1, spec: 2, unit: 3, qty: [4, 5, 6], price: 0 });
  const cable = rm.rows.find((r) => r.name === "케이블"), sw = rm.rows.find((r) => r.name === "스위치");
  ok(rm.rows.length === 2, "소계 행과 수량 없는 행은 제외");
  ok(cable?.qty === 150 && sw?.qty === 10, "여러 수량 열(층별)을 합산 (150, 10)");
  ok(cable?.spec === "HFIX 2.5" && cable?.unit === "m" && cable.rowNo === 4, "규격·단위·행 번호 보존");
  const one = await parseExcelBoq(b, { sheet: "산출", headerRow: 3, name: 1, spec: 0, unit: 0, qty: [4], price: 0 });
  ok(one.rows.find((r) => r.name === "케이블")?.qty === 100, "수량 열 1개만 지정하면 그 열만 사용");
  const bad = await parseExcelBoq(b, { sheet: "없는시트", headerRow: 1, name: 1, spec: 0, unit: 0, qty: [4], price: 0 });
  ok(bad.rows.length === 0 && bad.warnings.length > 0, "없는 시트를 지정하면 경고");

  if (fails) { console.log(`\n${fails}건 실패`); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
