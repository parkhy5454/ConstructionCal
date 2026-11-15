"use client";
import { useEffect, useState, useCallback } from "react";
import DisciplineTabs, { loadSavedDiscipline, saveDiscipline } from "@/app/app/DisciplineTabs";
import { fmt } from "@/lib/calc";
import type { Discipline } from "@/lib/calc";

type Mat = { id: number; category: string; name: string; spec: string; unit: string; price: number; maker: string; basis: string };
type Item = { id: number; chapter: string; section: string; title: string; spec: string; unit: string; labors: Array<{ name: string; factor: number }> };
const PAGE = 50;

export default function LookupPage() {
  const [discipline, setDiscipline] = useState<Discipline>("electrical");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"mat" | "pum">("mat");
  const [mats, setMats] = useState<Mat[]>([]);
  const [matTotal, setMatTotal] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [matMissing, setMatMissing] = useState(false);
  const [added, setAdded] = useState<Record<number, string>>({});
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setDiscipline(loadSavedDiscipline()); }, []);
  useEffect(() => { setOffset(0); }, [discipline, q, tab]);

  async function adopt(itemId: number) {
    setAdded((a) => ({ ...a, [itemId]: "담는 중..." }));
    try {
      const res = await fetch("/api/price-items/adopt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ discipline, itemId }) });
      const d = await res.json().catch(() => ({}));
      setAdded((a) => ({ ...a, [itemId]: res.ok ? (d.material?.created ? "✓ 담음" : "✓ 단가 갱신") : (d.error ?? "실패") }));
    } catch { setAdded((a) => ({ ...a, [itemId]: "실패" })); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const qs = `discipline=${discipline}&q=${encodeURIComponent(q)}&limit=${PAGE}`;
    const [mr, pr] = await Promise.all([
      fetch(`/api/price-items?${qs}&offset=${tab === "mat" ? offset : 0}`),
      fetch(`/api/pumsem-items?${qs}&offset=${tab === "pum" ? offset : 0}`),
    ]);
    const [md, pd] = await Promise.all([mr.json(), pr.json()]);
    setMats(md.rows ?? []); setMatTotal(md.total ?? 0); setMatMissing(!!md.missing);
    setItems(pd.rows ?? []); setItemTotal(pd.total ?? 0);
    setLoading(false);
  }, [discipline, q, tab, offset]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  function changeDiscipline(d: Discipline) { setDiscipline(d); saveDiscipline(d); }
  const total = tab === "mat" ? matTotal : itemTotal;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">🔎 자재·품셈 단가</h1>
        <p className="text-xs text-gray-400 mt-1">물가정보 전 품목의 규격·단가와 표준품셈의 공종별 공수를 검색해서 확인합니다. 여러 단어는 띄어 쓰면 모두 포함된 항목만 나옵니다.</p>
      </div>
      <DisciplineTabs value={discipline} onChange={changeDiscipline} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 차단기 3P 100A, HFIX 2.5, 후강전선관 28" className="w-full border rounded-lg px-3 py-2 text-sm bg-white" autoFocus />
      <div className="flex gap-2 text-sm">
        <button onClick={() => setTab("mat")} className={`px-3 py-1.5 rounded-lg border ${tab === "mat" ? "bg-[#e3efe8] border-[#1f6f54] text-[#1f6f54] font-semibold" : "bg-white text-gray-600"}`}>자재 단가 ({matTotal.toLocaleString()})</button>
        <button onClick={() => setTab("pum")} className={`px-3 py-1.5 rounded-lg border ${tab === "pum" ? "bg-[#e3efe8] border-[#1f6f54] text-[#1f6f54] font-semibold" : "bg-white text-gray-600"}`}>표준품셈 ({itemTotal.toLocaleString()})</button>
      </div>

      <section className="bg-white border rounded-xl overflow-x-auto">
        {tab === "mat" ? (
          <table className="w-full text-xs">
            <thead><tr className="text-gray-400 text-left bg-gray-50"><th className="py-2 px-3">분류</th><th className="py-2 px-3">품명</th><th className="py-2 px-3">규격</th><th className="py-2 px-3">단위</th><th className="py-2 px-3 text-right">단가(원)</th><th className="py-2 px-3">제조사</th><th className="py-2 px-3"></th></tr></thead>
            <tbody>
              {mats.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-1.5 px-3 text-gray-500">{m.category}</td>
                  <td className="py-1.5 px-3 font-medium">{m.name}</td>
                  <td className="py-1.5 px-3 text-gray-600">{m.spec}</td>
                  <td className="py-1.5 px-3">{m.unit}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{fmt(m.price)}</td>
                  <td className="py-1.5 px-3 text-gray-500">{m.maker}</td>
                  <td className="py-1.5 px-3 text-right whitespace-nowrap">
                    <button onClick={() => adopt(m.id)} className="text-[11px] border rounded px-2 py-0.5 hover:bg-gray-50">{added[m.id] ?? "내 자재로 담기"}</button>
                  </td>
                </tr>
              ))}
              {!loading && mats.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-400">{matMissing ? "공용 단가표가 아직 준비되지 않았습니다." : q ? "검색 결과가 없습니다." : "등록된 자재가 없습니다."}</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-gray-400 text-left bg-gray-50"><th className="py-2 px-3">공종</th><th className="py-2 px-3">규격</th><th className="py-2 px-3">단위</th><th className="py-2 px-3">직종별 공수(인)</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t align-top">
                  <td className="py-1.5 px-3"><div className="font-medium">{it.title}</div><div className="text-gray-400">{it.chapter}{it.section ? ` > ${it.section}` : ""}</div></td>
                  <td className="py-1.5 px-3 text-gray-600">{it.spec}</td>
                  <td className="py-1.5 px-3">{it.unit}</td>
                  <td className="py-1.5 px-3">{it.labors.map((l) => `${l.name} ${l.factor}`).join(", ")}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-gray-400">{q ? "검색 결과가 없습니다." : "등록된 표준품셈이 없습니다."}</td></tr>}
            </tbody>
          </table>
        )}
      </section>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{loading ? "불러오는 중..." : `${total.toLocaleString()}건 중 ${total === 0 ? 0 : offset + 1}~${Math.min(offset + PAGE, total)}`}</span>
        <span className="space-x-2">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="px-2 py-1 border rounded disabled:opacity-40 bg-white">이전</button>
          <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="px-2 py-1 border rounded disabled:opacity-40 bg-white">다음</button>
        </span>
      </div>
    </div>
  );
}
