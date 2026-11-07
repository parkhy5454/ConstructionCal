"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DISCIPLINE_LABELS } from "@/lib/calc";
import type { ComputeResult } from "@/lib/calc";

type Project = { id: number; name: string; discipline: string };

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

// 제출용 인쇄 페이지: 브라우저의 "인쇄 → PDF로 저장"으로 A4 PDF를 만듭니다. (서버 PDF 생성이 아니라 브라우저 인쇄 기능을 사용)
export default function PrintPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [client, setClient] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }));

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/projects/${params.id}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "불러오기 실패"); return; }
      setProject(data.project);
      setResult(data.result);
    })();
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!project || !result) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const costRows: Array<[string, string, number, boolean]> = [
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

  return (
    <div>
      <style>{`
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
      `}</style>

      <div className="no-print mb-4 bg-white border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/app/estimate/${project.id}`} className="text-xs text-gray-400 underline">← 견적서로</Link>
          <button onClick={() => window.print()} className="text-xs bg-black text-white rounded-lg px-3 py-1.5 font-semibold">
            🖨 인쇄 / PDF로 저장
          </button>
        </div>
        <p className="text-xs text-gray-400">
          인쇄 창에서 대상을 &quot;PDF로 저장&quot;으로 고르면 A4 PDF가 됩니다. 표지에 들어갈 정보는 아래에 입력하세요 (저장되지 않고 이 화면에서만 사용).
        </p>
        <div className="grid sm:grid-cols-3 gap-2">
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="상호 (제출자)" className="border rounded-lg px-3 py-2 text-sm" />
          <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="제출처 (귀중)" className="border rounded-lg px-3 py-2 text-sm" />
          <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="제출일" className="border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="print-page bg-white border rounded-xl p-8 text-black">
        {/* 표지 */}
        <section className="page-break" style={{ minHeight: "240mm", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
          <div style={{ fontSize: 14, letterSpacing: 8, color: "#555" }}>{DISCIPLINE_LABELS[project.discipline as keyof typeof DISCIPLINE_LABELS] ?? ""} 공사</div>
          <h1 style={{ fontSize: 34, fontWeight: 800, margin: "18px 0 40px" }}>견 적 서</h1>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{project.name}</div>
          <div style={{ margin: "40px auto 0", width: 320, fontSize: 14, textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #bbb", padding: "6px 0" }}><span>견적금액 (VAT 포함)</span><b>일금 {won(result.final)}원정</b></div>
            {client && <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #bbb", padding: "6px 0" }}><span>제출처</span><b>{client} 귀중</b></div>}
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #bbb", padding: "6px 0" }}><span>제출일</span><b>{date}</b></div>
            {company && <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #bbb", padding: "6px 0" }}><span>상호</span><b>{company}</b></div>}
          </div>
        </section>

        {/* 총괄표 + 원가계산서 */}
        <section className="page-break">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>총 괄 표</h2>
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

          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 6px" }}>원 가 계 산 서</h2>
          <table>
            <thead><tr><th>구분</th><th>산출식</th><th>금액(원)</th></tr></thead>
            <tbody>
              {costRows.map(([label, formula, amt, bold]) => (
                <tr key={label} style={bold ? { fontWeight: 700, background: "#e3efe8" } : undefined}>
                  <td style={{ whiteSpace: "pre" }}>{label}</td><td>{formula}</td><td className="n">{won(amt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 내역서 */}
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>내 역 서</h2>
          <table>
            <thead><tr><th>품명 / 규격</th><th>단위</th><th>수량</th><th>재료비</th><th>노무비</th><th>경비</th><th>계</th></tr></thead>
            <tbody>
              {result.groupResults.map((g) => (
                <GroupRows key={g.g} g={g} />
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 10, color: "#777", marginTop: 8 }}>* 표준품셈(공수)이 없는 품목은 노무비 없이 재료비만 반영되었습니다.</p>
        </section>
      </div>
    </div>
  );
}

function GroupRows({ g }: { g: ComputeResult["groupResults"][number] }) {
  const extra: Array<[string, string, number, number, number, number]> = [
    ["배관 부속재", "식", 1, g.accessory, 0, 0],
    ["소모 잡자재", "식", 1, g.consumable, 0, 0],
    ["노무비 (공수)", "인", Number(g.laborHeadcount.toFixed(2)), 0, g.laborAmt, 0],
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
