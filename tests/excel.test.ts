import ExcelJS from "exceljs";
import { parseExcelBoq } from "../lib/excelImport";
import { matchRows, normUnit } from "../lib/excelMatch";
import { DEFAULT_MATERIALS, DEFAULT_MATERIALS_TELECOM } from "../lib/calc";

async function main() {
  const mats = DEFAULT_MATERIALS.map((m, i) => ({ id: i + 1, ...m }));
  console.log("전기 자재 목록(앞 12):");
  mats.slice(0, 12).forEach((m) => console.log(`  ${m.id}. ${m.name} | ${m.spec} | ${m.unit} | ${m.price}`));

  // ---- 양식 A: 2단 헤더(재료비/노무비 아래 단가·금액), 공종 제목행, 소계/합계행, 표기 변형, 병합셀 ----
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("내역서");
  ws.addRow(["공사명: 테스트빌딩 전기공사"]);
  ws.addRow([]);
  ws.addRow(["번호", "품 명", "규 격", "단 위", "수 량", "재료비", "", "노무비", ""]);
  ws.addRow(["", "", "", "", "", "단가", "금액", "단가", "금액"]);
  ws.mergeCells("F3:G3");
  ws.mergeCells("H3:I3");
  const g1 = ws.addRow(["1", "1.전열공사"]);
  ws.mergeCells(g1.number, 2, g1.number, 9);
  const a = mats[0], b = mats[1], c = mats[2];
  ws.addRow([1, a.name, a.spec.replace(/\s/g, ""), a.unit, 120, a.price, 120 * a.price, 0, 0]);
  ws.addRow([2, b.name.toUpperCase(), b.spec.replace("㎟", "mm²"), b.unit, 35, 1000, 35000, 0, 0]);
  ws.addRow([3, "알 수 없는 특수자재", "ZZ-99", "개", 4, 5000, 20000, 0, 0]);
  ws.addRow(["", "소 계", "", "", "", "", 99999, "", ""]);
  const g2 = ws.addRow(["2", "2.조명공사"]);
  ws.mergeCells(g2.number, 2, g2.number, 9);
  ws.addRow([4, c.name, c.spec, c.unit, 20, c.price, 20 * c.price, 0, 0]);
  ws.addRow([5, c.name, "전혀다른규격 99", c.unit, 3, c.price, 3 * c.price, 0, 0]);
  ws.addRow(["", "합 계", "", "", "", "", 123456, "", ""]);

  // 보조 시트(일위대가) — 기본 제외되어야 함
  const ws2 = wb.addWorksheet("일위대가");
  ws2.addRow(["품명", "규격", "단위", "수량", "단가"]);
  ws2.addRow(["내선전공", "", "인", 0.12, 239716]);

  // ---- 양식 B: 1단 헤더, 품명/규격 한 칸, 규격열 없음 ----
  const ws3 = wb.addWorksheet("통신내역");
  ws3.addRow(["품명/규격", "단위", "수량", "재료비단가", "노무비단가"]);
  const t = DEFAULT_MATERIALS_TELECOM[0];
  ws3.addRow([`${t.name} ${t.spec}`, t.unit, 2, t.price, 0]);

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const parsed = await parseExcelBoq(buf);

  console.log("\n시트:", JSON.stringify(parsed.sheets));
  console.log("경고:", parsed.warnings);
  console.log("행 수:", parsed.rows.length);

  const telMats = DEFAULT_MATERIALS_TELECOM.map((m, i) => ({ id: 1000 + i, ...m }));
  const all = [...mats, ...telMats];
  const res = matchRows(parsed.rows, all, new Map());
  parsed.rows.forEach((r, i) => {
    const m = res[i];
    const mat = all.find((x) => x.id === m.materialId);
    const unitWarn = mat && r.unit && normUnit(r.unit) !== normUnit(mat.unit) ? " ⚠단위불일치" : "";
    console.log(
      `[${r.sheet}#${r.rowNo}] 공종="${r.groupName}" ${r.name} | ${r.spec} | ${r.unit} | qty=${r.qty} price=${r.origPrice}` +
        `\n    → ${m.method}(${m.score}) ${mat ? `${mat.name} | ${mat.spec}` : "-"}${unitWarn}`
    );
  });

  // 기대값 검증
  const fails: string[] = [];
  const rowsA = parsed.rows.filter((r) => r.sheet === "내역서");
  if (rowsA.length !== 5) fails.push(`내역서 행 수 ${rowsA.length} != 5 (소계/합계/제목행 제외 실패?)`);
  if (rowsA[0]?.groupName !== "1.전열공사") fails.push("그룹명 인식 실패");
  if (rowsA[3]?.groupName !== "2.조명공사") fails.push("두번째 그룹명 인식 실패");
  if (rowsA[0]?.origPrice !== a.price) fails.push("재료비 단가 열 인식 실패");
  if (parsed.sheets.find((s) => s.name === "일위대가")?.defaultInclude) fails.push("일위대가 시트가 기본 포함됨");
  if (res[0].method !== "exact") fails.push(`표기변형(공백제거) 정확매칭 실패: ${res[0].method}`);
  if (res[1].method === "none") fails.push(`표기변형(대문자/㎟→mm²) 매칭 실패`);
  if (res[2].method !== "none") fails.push(`미등록 자재가 매칭됨: ${res[2].method}`);
  if (res[4].materialId === c.id && res[4].method === "exact") fails.push("다른 규격이 정확매칭됨");
  const tel = res[parsed.rows.findIndex((r) => r.sheet === "통신내역")];
  if (tel?.method !== "exact") fails.push(`품명/규격 한 칸 양식 매칭 실패: ${tel?.method}`);
  console.log(fails.length ? `\n❌ 실패:\n - ${fails.join("\n - ")}` : "\n✅ 모든 기대값 통과");
}
main().catch((e) => { console.error(e); process.exit(1); });
