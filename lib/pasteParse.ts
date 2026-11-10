// 엑셀/표에서 복사해 붙여넣은 텍스트를 품명·규격·단위·수량 행으로 나눕니다(탭 > 쉼표 > 2칸 이상 공백 순으로 구분).
export type PastedRow = { name: string; spec: string; unit: string; qty: number };

const num = (s: string): number | null => {
  const t = s.replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
};
const HEAD = /^(품명|품목|자재|명칭|규격|단위|수량|물량|번호|no)/i;
const SKIP = /^(소계|합계|총계|계)$/;

export function parsePasted(text: string): { rows: PastedRow[]; skipped: number } {
  const rows: PastedRow[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const sep = raw.includes("\t") ? /\t/ : raw.includes(",") && !/\d,\d{3}\b/.test(raw) ? /,/ : /\s{2,}/;
    const cells = raw.split(sep).map((c) => c.trim());
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    if (cells.length < 2) { skipped++; continue; }
    if (HEAD.test(cells[0]) && cells.some((c) => /^(수량|물량)$/.test(c.replace(/\s+/g, ""))) && !cells.some((c) => num(c) !== null)) continue; // 헤더 행
    // 수량 = 오른쪽에서 처음 나오는 숫자 칸. 앞선 칸은 품명(맨 앞) · 단위(짧은 글자) · 규격(나머지).
    let qi = -1;
    for (let i = cells.length - 1; i >= 1; i--) if (num(cells[i]) !== null) { qi = i; break; }
    if (qi < 0) { skipped++; continue; }
    const qty = num(cells[qi])!;
    const name = cells[0];
    if (!name || SKIP.test(name.replace(/\s+/g, "")) || qty <= 0) { skipped++; continue; }
    const mid = cells.slice(1, qi);
    let unit = "";
    const ui = mid.findIndex((c) => c.length > 0 && c.length <= 3 && num(c) === null);
    if (ui >= 0) unit = mid[ui];
    const spec = mid.filter((_, i) => i !== ui).filter(Boolean).join(" ");
    rows.push({ name, spec, unit, qty });
  }
  return { rows, skipped };
}
