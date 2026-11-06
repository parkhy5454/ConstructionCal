"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fmt } from "@/lib/calc";
import type { ComputeResult } from "@/lib/calc";

type Project = { id: number; name: string };

export default function HomePage() {
  const [project, setProject] = useState<Project | null>(null);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const pres = await fetch("/api/projects");
      const pdata = await pres.json();
      const projects: Project[] = pdata.projects ?? [];
      if (projects.length === 0) {
        setLoading(false);
        return;
      }
      const first = projects[0];
      setProject(first);
      const dres = await fetch(`/api/projects/${first.id}`);
      const ddata = await dres.json();
      setResult(ddata.result);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;
  if (!project || !result) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-gray-500 mb-4">아직 견적서가 없습니다.</p>
        <Link href="/app/estimate" className="inline-block bg-black text-white rounded-lg px-5 py-2 text-sm font-semibold">
          견적서 만들러 가기
        </Link>
      </div>
    );
  }

  const max = Math.max(...result.groupResults.map((g) => g.groupTotal), 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold">🏠 홈</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          최근 견적서 · <Link href={`/app/estimate/${project.id}`} className="underline">{project.name}</Link>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="직접재료비" value={result.sumMat} />
        <Kpi label="노무비(소계)" value={result.laborSubtotal} />
        <Kpi label="경비(소계)" value={result.expenseSubtotal} />
        <Kpi label="최종 견적금액" value={result.final} accent />
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3">공종별 비중</h2>
        <div className="space-y-2">
          {result.groupResults.map((g) => (
            <div key={g.g} className="flex items-center gap-2">
              <div className="w-24 shrink-0 text-xs text-gray-500">{g.g}</div>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-black rounded-full" style={{ width: `${(g.groupTotal / max) * 100}%` }} />
              </div>
              <div className="w-24 shrink-0 text-right text-xs font-semibold">{fmt(g.groupTotal)}원</div>
            </div>
          ))}
        </div>
      </div>

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
