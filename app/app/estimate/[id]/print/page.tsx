"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DISCIPLINE_LABELS } from "@/lib/calc";
import type { ComputeResult } from "@/lib/calc";
import { won, DOC_CSS, SummaryTable, CostTable, DetailTable } from "@/components/EstimateTables";

type Project = { id: number; name: string; discipline: string };


// 제출용 인쇄 페이지: 브라우저의 "인쇄 → PDF로 저장"으로 A4 PDF를 만듭니다. (서버 PDF 생성이 아니라 브라우저 인쇄 기능을 사용)
export default function PrintPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [client, setClient] = useState("");
  const [date, setDate] = useState(() => new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }));
  const [logo, setLogo] = useState<string | null>(null);
  const [seal, setSeal] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [showIld, setShowIld] = useState(true);
  const [showSign, setShowSign] = useState(true);
  const loaded = useRef(false);

  // 제출자 정보(상호·로고·직인)는 이 브라우저에만 저장해 다음 견적서에서도 재사용합니다(서버 저장 아님).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("concal_print_profile");
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v.company === "string") setCompany(v.company);
        if (typeof v.logo === "string") setLogo(v.logo);
        if (typeof v.seal === "string") setSeal(v.seal);
      }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem("concal_print_profile", JSON.stringify({ company, logo, seal }));
    } catch {}
  }, [company, logo, seal]);

  function pickImage(setter: (v: string | null) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { alert("PNG 또는 JPG 이미지만 가능합니다."); return; }
      if (f.size > 500 * 1024) { alert("이미지는 500KB 이하로 올려주세요."); return; }
      const r = new FileReader();
      r.onload = () => setter(typeof r.result === "string" ? r.result : null);
      r.readAsDataURL(f);
    };
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/projects/${params.id}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "불러오기 실패"); return; }
      setProject(data.project);
      setResult(data.result);
      const cid = data.meta?.clientId;
      const c = (data.clients ?? []).find((x: { id: number; name: string }) => x.id === cid);
      if (c) setClient(c.name);
    })();
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!project || !result) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const usedIds = new Set(result.groupResults.flatMap((g) => g.items.filter((i) => i.qty > 0).map((i) => i.materialId)));
  const usedIld = result.ild.filter((r) => usedIds.has(r.materialId));

  return (
    <div>
      <style>{DOC_CSS}</style>

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
        <div className="grid sm:grid-cols-2 gap-2 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0">로고</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickImage(setLogo)} className="text-xs" />
            {logo && <button type="button" onClick={() => setLogo(null)} className="underline text-gray-400">제거</button>}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0">직인</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickImage(setSeal)} className="text-xs" />
            {seal && <button type="button" onClick={() => setSeal(null)} className="underline text-gray-400">제거</button>}
          </div>
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000}
          placeholder="비고 (예: 견적 유효기간 30일, 부가세 별도/포함, 결제 조건 등) — 내역서 끝에 인쇄됩니다"
          className="w-full border rounded-lg px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={showSign} onChange={(e) => setShowSign(e.target.checked)} /> 표지에 결재란 넣기</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={showIld} onChange={(e) => setShowIld(e.target.checked)} /> 일위대가표 포함</label>
        </div>
        <p className="text-[11px] text-gray-400">상호·로고·직인은 이 브라우저에만 저장되며 서버로 전송되지 않습니다. 도장 이미지는 배경이 투명한 PNG가 가장 깔끔합니다.</p>
      </div>

      <div className="print-page bg-white border rounded-xl p-8 text-black">
        {/* 표지 */}
        <section className="page-break" style={{ minHeight: "240mm", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center", position: "relative" }}>
          {showSign && (
            <table style={{ position: "absolute", top: 0, right: 0, width: 210, fontSize: 11, textAlign: "center" }}>
              <tbody>
                <tr><th rowSpan={2} style={{ width: 24 }}>결재</th><th>담당</th><th>검토</th><th>승인</th></tr>
                <tr><td style={{ height: 52 }}></td><td></td><td></td></tr>
              </tbody>
            </table>
          )}
          {logo && <img src={logo} alt="로고" style={{ maxHeight: 70, maxWidth: 220, margin: "0 auto 28px", objectFit: "contain" }} />}
          <div style={{ fontSize: 14, letterSpacing: 8, color: "#555" }}>{DISCIPLINE_LABELS[project.discipline as keyof typeof DISCIPLINE_LABELS] ?? ""} 공사</div>
          <h1 style={{ fontSize: 34, fontWeight: 800, margin: "18px 0 40px" }}>견 적 서</h1>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{project.name}</div>
          <div style={{ margin: "40px auto 0", width: 320, fontSize: 14, textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #bbb", padding: "6px 0" }}><span>견적금액 (VAT 포함)</span><b>일금 {won(result.final)}원정</b></div>
            {client && <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #bbb", padding: "6px 0" }}><span>제출처</span><b>{client} 귀중</b></div>}
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #bbb", padding: "6px 0" }}><span>제출일</span><b>{date}</b></div>
            {company && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #bbb", padding: "6px 0", position: "relative" }}>
                <span>상호</span>
                <b>{company}</b>
                {seal && <img src={seal} alt="직인" style={{ position: "absolute", right: -6, top: -14, width: 54, height: 54, objectFit: "contain", opacity: 0.9 }} />}
              </div>
            )}
            {!company && seal && <img src={seal} alt="직인" style={{ width: 54, height: 54, objectFit: "contain", marginLeft: "auto", marginTop: 8 }} />}
          </div>
        </section>

        {/* 총괄표 + 원가계산서 */}
        <section className="page-break">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>총 괄 표</h2>
          <SummaryTable result={result} />

          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 6px" }}>원 가 계 산 서</h2>
          <CostTable result={result} />
        </section>

        {/* 내역서 */}
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>내 역 서</h2>
          <DetailTable result={result} />
          <p style={{ fontSize: 10, color: "#777", marginTop: 8 }}>* 표준품셈(공수)이 없는 품목은 노무비 없이 재료비만 반영되었습니다.</p>
          {notes.trim() && (
            <div style={{ marginTop: 14, border: "1px solid #bbb", padding: "8px 10px", fontSize: 11, whiteSpace: "pre-wrap" }}>
              <b>비고</b>
              <div style={{ marginTop: 4 }}>{notes.trim()}</div>
            </div>
          )}
        </section>

        {showIld && (
          <section style={{ breakBefore: "page" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>일 위 대 가 표</h2>
            <p style={{ fontSize: 10, color: "#777", marginBottom: 6 }}>자재 단가에 표준품셈 공수를 곱한 노무비를 더한 품목별 단위 단가입니다. (본 견적서에 사용된 품목만 표시)</p>
            <table>
              <thead><tr><th>품명 / 규격</th><th>단위</th><th>재료비 단가</th><th>노무비 단가</th><th>합계 단가</th><th>공수(인)</th></tr></thead>
              <tbody>
                {usedIld.map((r, i) => (
                  <tr key={`${r.materialId}-${i}`}>
                    <td>{r.name} {r.spec}</td><td style={{ textAlign: "center" }}>{r.unit}</td>
                    <td className="n">{won(r.matPrice)}</td><td className="n">{won(r.laborPrice)}</td><td className="n">{won(r.sum)}</td>
                    <td className="n">{r.factor ? r.factor.toFixed(3) : "-"}</td>
                  </tr>
                ))}
                {usedIld.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "#999" }}>해당 없음</td></tr>}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
