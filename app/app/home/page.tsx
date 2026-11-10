"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "@/lib/calc";
import type { ComputeResult } from "@/lib/calc";

type Stats = {
  total: number; withItems: number;
  byStatus: Record<string, { count: number; amount: number }>;
  months: Array<{ label: string; amount: number; count: number }>;
  latest: { id: number; name: string } | null;
};

const STATUS: Array<[string, string]> = [["draft", "작성 중"], ["submitted", "제출"], ["won", "수주"], ["lost", "실주"]];

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideGuide, setHideGuide] = useState(false);
  const [visitedPrices, setVisitedPrices] = useState(false);

  useEffect(() => {
    try {
      setHideGuide(localStorage.getItem("concal_guide_done") === "1");
      setVisitedPrices(localStorage.getItem("concal_guide_prices") === "1");
    } catch {}
    (async () => {
      const sres = await fetch("/api/stats");
      const s: Stats | null = sres.ok ? await sres.json() : null;
      setStats(s);
      if (s?.latest) {
        const dres = await fetch(`/api/projects/${s.latest.id}`);
        const d = await dres.json().catch(() => null);
        if (dres.ok) setResult(d.result);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const steps = [
    { done: (stats?.total ?? 0) > 0, title: "견적서 만들기", desc: "업종(전기·통신·소방…)을 고르고 새 견적서를 만들거나, 이미 들어 있는 예시 견적서를 열어 보세요.", href: "/app/estimate", cta: "견적서 열기" },
    { done: (stats?.withItems ?? 0) > 0, title: "물량 넣기", desc: "도면(DXF)이나 기존 엑셀 내역서를 올리면 물량이 자동으로 들어갑니다. 직접 입력도 됩니다.", href: stats?.latest ? `/app/estimate/${stats.latest.id}` : "/app/estimate", cta: "물량 넣으러 가기" },
    { done: visitedPrices, title: "단가·품셈 확인", desc: "내 단가와 표준품셈(공수), 노임단가를 확인하고 필요하면 수정하세요. 이 값으로 모든 견적이 계산됩니다.", href: "/app/prices", cta: "물가정보 보기", onClick: () => { try { localStorage.setItem("concal_guide_prices", "1"); } catch {} } },
    { done: false, title: "내려받기·제출", desc: "엑셀 내역서를 내려받거나 '저장'(인쇄·PDF)으로 표지·결재란이 있는 제출 문서를 만들어 보세요. 발주처에는 읽기 전용 공유 링크도 보낼 수 있습니다.", href: stats?.latest ? `/app/estimate/${stats.latest.id}/print` : "/app/estimate", cta: "제출용 문서 보기", optional: true },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const showGuide = !hideGuide;

  const maxMonth = Math.max(...(stats?.months.map((m) => m.amount) ?? [0]), 1);
  const max = result ? Math.max(...result.groupResults.map((g) => g.groupTotal), 1) : 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold">🏠 홈</h1>
        {stats?.latest && (
          <p className="text-xs text-gray-400 mt-0.5">
            최근 견적서 · <Link href={`/app/estimate/${stats.latest.id}`} className="underline">{stats.latest.name}</Link>
          </p>
        )}
      </div>

      {showGuide && (
        <div className="bg-white border border-[#cfe3d8] rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">시작 가이드 <span className="text-[#1f6f54]">{doneCount}/{steps.length}</span></h2>
              <p className="text-xs text-gray-400 mt-0.5">처음이라면 이 순서로 따라 해 보세요.</p>
            </div>
            <button onClick={() => { setHideGuide(true); try { localStorage.setItem("concal_guide_done", "1"); } catch {} }} className="text-[11px] text-gray-400 underline shrink-0">닫기</button>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden"><div className="h-full bg-[#1f6f54]" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
          <ol className="mt-3 space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`mt-0.5 grid place-items-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 ${s.done ? "bg-[#1f6f54] text-white" : "bg-gray-100 text-gray-500"}`}>{s.done ? "✓" : i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="text-xs text-gray-500">{s.desc}</div>
                </div>
                <Link href={s.href} onClick={s.onClick} className="text-xs bg-black text-white rounded-lg px-2.5 py-1.5 font-semibold shrink-0">{s.cta}</Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {stats && stats.total > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATUS.map(([k, l]) => (
              <div key={k} className="rounded-xl bg-gray-100 p-3">
                <div className="text-[11px] font-semibold text-gray-500">{l}</div>
                <div className="text-base font-extrabold mt-1">{stats.byStatus[k]?.count ?? 0}건</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{fmt(stats.byStatus[k]?.amount ?? 0)}원</div>
              </div>
            ))}
          </div>

          <div className="bg-white border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">월별 견적 금액 <span className="text-[11px] font-normal text-gray-400">(최근 6개월, 만든 달 기준)</span></h2>
            <div className="flex items-end gap-2 h-28">
              {stats.months.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-[10px] text-gray-400 mb-1">{m.count > 0 ? `${m.count}건` : ""}</div>
                  <div className="w-full bg-black rounded-t" style={{ height: `${Math.max((m.amount / maxMonth) * 100, m.amount > 0 ? 4 : 0)}%` }} title={`${fmt(m.amount)}원`} />
                  <div className="text-[11px] text-gray-500 mt-1">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!stats || stats.total === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 mb-4">아직 견적서가 없습니다.</p>
          <Link href="/app/estimate" className="inline-block bg-black text-white rounded-lg px-5 py-2 text-sm font-semibold">견적서 만들러 가기</Link>
        </div>
      ) : result ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="직접재료비" value={result.sumMat} />
            <Kpi label="노무비(소계)" value={result.laborSubtotal} />
            <Kpi label="경비(소계)" value={result.expenseSubtotal} />
            <Kpi label="최종 견적금액" value={result.final} accent />
          </div>
          <div className="bg-white border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">공종별 비중 <span className="text-[11px] font-normal text-gray-400">(최근 견적서)</span></h2>
            <div className="space-y-2">
              {result.groupResults.map((g) => (
                <div key={g.g} className="flex items-center gap-2">
                  <div className="w-24 shrink-0 text-xs text-gray-500">{g.g}</div>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-black rounded-full" style={{ width: `${(g.groupTotal / max) * 100}%` }} /></div>
                  <div className="w-24 shrink-0 text-right text-xs font-semibold">{fmt(g.groupTotal)}원</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div className="bg-white border rounded-xl p-4 text-xs text-gray-500 leading-relaxed">
        견적서 탭에서 수량을 바꾸면 내역서·총괄표·원가계산서가 즉시 재계산됩니다. 물가정보·표준품셈 탭의 단가/공수는 실제로는
        매월·매년 발표되는 자료로 교체해 사용하는 값입니다.
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? "bg-black text-white" : "bg-gray-100"}`}>
      <div className={`text-[11px] font-semibold ${accent ? "text-gray-300" : "text-gray-500"}`}>{label}</div>
      <div className="text-base font-extrabold mt-1">{fmt(value)}원</div>
    </div>
  );
}
