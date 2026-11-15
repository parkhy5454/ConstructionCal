import { PRINT_MARGIN_Y_MM } from "./PrintSheets";

const MM = 96 / 25.4;

type Atom = { top: number; bottom: number; at?: Element; thead?: number; first?: boolean }; // at = 빈 칸을 넣을 기준(행이면 그 뒤, tbody면 맨 끝)

/** 시트 안의 내용을 "페이지를 가를 수 없는 덩어리"(atom) 순서로 나열합니다. 표 행·tbody.blk·.blk 묶음·제목 등. */
function collectAtoms(sec: HTMLElement, avail: number): Atom[] {
  const base = sec.getBoundingClientRect().top;
  const rel = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top - base, bottom: r.bottom - base }; };
  const out: Atom[] = [];
  const walk = (el: Element) => {
    if (el.tagName === "TABLE") {
      const table = el as HTMLTableElement;
      const head = table.tHead ? table.tHead.getBoundingClientRect().height : 0;
      if (table.tHead) out.push({ ...rel(table.tHead), thead: head, first: true });
      for (const tb of Array.from(table.tBodies)) {
        const r = rel(tb);
        if (tb.classList.contains("blk") && r.bottom - r.top <= avail) out.push({ ...r, at: tb, thead: head });
        else for (const tr of Array.from(tb.rows)) out.push({ ...rel(tr), at: tr, thead: head });
      }
      return;
    }
    const r = rel(el);
    if (el.classList.contains("blk") && r.bottom - r.top <= avail) { // 묶음(제목+표)은 통째로 다음 쪽으로 넘어갑니다. 표가 있으면 채울 표로 기억.
      { const t = el.querySelector("table"); out.push({ ...r, at: t ? t.tBodies[t.tBodies.length - 1] : undefined, thead: 0 }); }
      return;
    }
    if (el.querySelector("table")) { for (const c of Array.from(el.children)) walk(c); return; }
    out.push(rel(el));
  };
  for (const c of Array.from(sec.children)) walk(c);
  return out;
}

/** 첫 번째로 아래가 남는 쪽을 찾아 {빈 칸을 넣을 표, 남는 높이}를 돌려줍니다. 없으면 null. */
function findGap(sec: HTMLElement, avail: number, rowH: number): { at: Element; left: number } | null {
  const atoms = collectAtoms(sec, avail);
  let shift = 0, lastBottom = 0, lastAt: Element | undefined, any = false;
  const flush = (): { at: Element; left: number } | null => {
    if (!any || !lastAt) return null;
    const left = avail - (lastBottom - shift);
    return left >= rowH ? { at: lastAt, left } : null;
  };
  for (const a of atoms) {
    if (any && a.bottom - shift > avail) { // 이 덩어리가 지금 쪽에 안 들어감 → 새 쪽
      const g = flush();
      if (g) return g;
      shift = a.top - (a.thead && !a.first ? a.thead : 0);
      lastAt = undefined;
    }
    lastBottom = a.bottom; any = true;
    if (a.at) lastAt = a.at;
  }
  return flush();
}

function addBlankRow(at: Element): HTMLElement | null {
  const body = (at.tagName === "TR" ? at.parentElement : at) as HTMLTableSectionElement | null;
  if (!body || !("rows" in body)) return null;
  let cells = 0;
  for (const r of Array.from(body.rows)) cells = Math.max(cells, r.children.length);
  if (cells === 0) return null;
  const tr = document.createElement("tr");
  tr.className = "autofill";
  for (let j = 0; j < cells; j++) tr.appendChild(document.createElement("td"));
  if (at.tagName === "TR") at.after(tr);
  else {
    const tot = Array.from(body.rows).reverse().find((r) => r.classList.contains("tot")); // 합계 행이 있으면 그 앞에
    body.insertBefore(tr, tot ?? null);
  }
  return tr;
}

/** 인쇄 직전에, 각 쪽 아래가 많이 남으면 빈 칸(행)을 채워 아래 여백 선까지 표가 닿게 합니다. */
function fit() {
  document.querySelectorAll<HTMLElement>(".sheet").forEach((sec) => {
    sec.querySelectorAll("tr.autofill").forEach((r) => r.remove());
    const pageH = sec.classList.contains("landscape") ? 210 : 297;
    const avail = (pageH - 2 * PRINT_MARGIN_Y_MM - 2) * MM; // 2mm는 반올림 여유
    let rowH = 22; // 빈 행의 실제 높이는 처음 넣을 때 재서 갱신
    for (let guard = 0; guard < 300; guard++) {
      const gap = findGap(sec, avail, rowH);
      if (!gap) break;
      const before = sec.getBoundingClientRect().height;
      const tr = addBlankRow(gap.at);
      if (!tr) break;
      rowH = Math.max(12, sec.getBoundingClientRect().height - before) || rowH;
      // 한 번에 가능한 만큼 더 넣고(처음 잰 높이로), 다시 쪽 계산
      let n = Math.floor((gap.left - rowH) / rowH);
      while (n-- > 0) addBlankRow(gap.at);
    }
  });
}
function clear() {
  document.documentElement.classList.remove("printing");
  document.querySelectorAll("tr.autofill").forEach((r) => r.remove());
}
export function installPrintFit(): () => void {
  const before = () => { document.documentElement.classList.add("printing"); fit(); };
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", clear);
  return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", clear); clear(); };
}
