// 견적서 문서(총괄표·원가계산서·내역서) 표 컴포넌트. 제출용 인쇄 페이지와 공유 링크 페이지가 함께 씁니다. (훅 없음: 서버/클라이언트 모두 사용 가능)
import type { ComputeResult } from "@/lib/calc";

export const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

export const DOC_CSS = `
  @page { size: A4; margin: 14mm; }
  @media print {
    nav, header, .no-print { display: none !important; }
    body, .min-h-screen { background: #fff !important; }
    .print-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; }
    .page-break { break-after: page; }
    tr { break-inside: avoid; }
    thead { display: table-header-group; }
  }
  .print-page table { border-collapse: collapse; width: 100%; font-size: 11px; }
  .print-page th, .print-page td { border: 1px solid #bbb; padding: 3px 6px; }
  .print-page th { background: #efefef; }
  .print-page td.n { text-align: right; font-variant-numeric: tabular-nums; }
`;

export function costRowsOf(result: ComputeResult): Array<[string, string, number, boolean]> {
  return [
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
}

export function SummaryTable({ result }: { result: ComputeResult }) {
  return (
    <table>
      <thead><tr><th>공종</th><th>재료비</th><th>노무비</th><th>경비</th><th>계</th></tr></thead>
      <tbody>
        {result.groupResults.map((g) => (
          <tr key={g.g}><td>{g.g}</td><td className="n">{won(g.matTotal)}</td><td className="n">{won(g.laborTotal)}</td><td className="n">{won(g.expenseTotal)}</td><td className="n">{won(g.groupTotal)}</td></tr>
        ))}
        <tr style={{ fontWeight: 700, background: "#e3efe8" }}>
          <td>합 계</td><td className="n">{won(result.sumMat)}</td><td className="n">{won(result.sumLabor)}</td><td className="n">{won(result.sumExpense)}</td>
          <td className="n">{won(result.sumMat + result.sumLabor + result.sumExpense)}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function CostTable({ result }: { result: ComputeResult }) {
  return (
    <table>
      <thead><tr><th>구분</th><th>산출식</th><th>금액(원)</th></tr></thead>
      <tbody>
        {costRowsOf(result).map(([label, formula, amt, bold]) => (
          <tr key={label} style={bold ? { fontWeight: 700, background: "#e3efe8" } : undefined}>
            <td style={{ whiteSpace: "pre" }}>{label}</td><td>{formula}</td><td className="n">{won(amt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DetailTable({ result }: { result: ComputeResult }) {
  return (
    <table>
      <thead><tr><th>품명 / 규격</th><th>단위</th><th>수량</th><th>재료비</th><th>노무비</th><th>경비</th><th>계</th></tr></thead>
      <tbody>
        {result.groupResults.map((g) => <GroupRows key={g.g} g={g} />)}
      </tbody>
    </table>
  );
}

function GroupRows({ g }: { g: ComputeResult["groupResults"][number] }) {
  const extra: Array<[string, string, number, number, number, number]> = [
    ["배관 부속재", "식", 1, g.accessory, 0, 0],
    ["소모 잡자재", "식", 1, g.consumable, 0, 0],
    ["노무비 (공수)", "인", Number(g.laborHeadcount.toFixed(2)), 0, g.laborAmt, 0],
    ...(g.laborSurcharge !== 0 ? [["노무비 할증", "식", 1, 0, g.laborSurcharge, 0] as [string, string, number, number, number, number]] : []),
    ["공구손료", "식", 1, 0, 0, g.toolLoss],
  ];
  return (
    <>
      <tr><td colSpan={7} style={{ fontWeight: 700, background: "#e3efe8" }}>{g.g}</td></tr>
      {g.items.map((it, i) => (
        <tr key={i}>
          <td>{it.name} {it.spec}{it.neededLabor === 0 && it.qty > 0 ? " *" : ""}</td>
          <td style={{ textAlign: "center" }}>{it.unit}</td>
          <td className="n">{it.qty}</td>
          <td className="n">{won(it.matAmt)}</td><td className="n">0</td><td className="n">0</td><td className="n">{won(it.matAmt)}</td>
        </tr>
      ))}
      {extra.map(([name, unit, qty, m, l, e]) => (
        <tr key={name} style={{ color: "#666", fontStyle: "italic" }}>
          <td>{name}</td><td style={{ textAlign: "center" }}>{unit}</td><td className="n">{qty}</td>
          <td className="n">{won(m)}</td><td className="n">{won(l)}</td><td className="n">{won(e)}</td><td className="n">{won(m + l + e)}</td>
        </tr>
      ))}
      <tr style={{ fontWeight: 700 }}>
        <td colSpan={3}>합 계</td>
        <td className="n">{won(g.matTotal)}</td><td className="n">{won(g.laborTotal)}</td><td className="n">{won(g.expenseTotal)}</td><td className="n">{won(g.groupTotal)}</td>
      </tr>
    </>
  );
}
