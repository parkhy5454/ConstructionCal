import { PRINT_MARGIN_Y_MM } from "./PrintSheets";

const MM = 96 / 25.4;

/** 인쇄 직전에 집계표·견적서(data-fit)가 한 장 안에 들어가면, 아래 여백(25mm) 선까지 표가 닿도록 빈 칸(행)을 채워 넣습니다. */
function fit() {
  document.querySelectorAll<HTMLElement>(".sheet[data-fit]").forEach((sec) => {
    sec.querySelectorAll("tr.autofill").forEach((r) => r.remove());
    const pageH = sec.classList.contains("landscape") ? 210 : 297;
    const avail = (pageH - 2 * PRINT_MARGIN_Y_MM - 1.5) * MM; // 1.5mm는 반올림 여유
    if (sec.getBoundingClientRect().height > avail) return; // 이미 한 장을 넘으면 건드리지 않음
    const tables = sec.querySelectorAll("table");
    const body = tables[tables.length - 1]?.querySelector("tbody");
    const proto = body?.querySelector("tr:not(.tot)");
    if (!body || !proto) return;
    const tot = body.querySelector("tr.tot");
    const cells = proto.children.length;
    for (let i = 0; i < 80; i++) {
      const tr = proto.cloneNode(false) as HTMLElement;
      tr.classList.add("autofill");
      for (let j = 0; j < cells; j++) tr.appendChild(document.createElement("td"));
      body.insertBefore(tr, tot);
      if (sec.getBoundingClientRect().height > avail) { tr.remove(); break; }
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
