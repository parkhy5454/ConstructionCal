"use client";
import { useCallback, useEffect, useState } from "react";
import MaterialPicker from "@/components/MaterialPicker";
import type { Discipline } from "@/lib/calc";

type Item = { id: number; code: string; chapter: string; section: string; title: string; spec: string; unit: string; page: number | null; review: string; labors: Array<{ name: string; factor: number }> };
const PAGE = 30;

/** 표준품셈 책(공종 중심) 검색 — 항목을 골라 내 자재에 공수를 적용합니다. */
export default function PumsemBook({ discipline, onApplied }: { discipline: Discipline; onApplied: () => void }) {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [missing, setMissing] = useState(false);
  const [pick, setPick] = useState<Item | null>(null);
  const [materialId, setMaterialId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/pumsem-items?discipline=${discipline}&q=${encodeURIComponent(q)}&limit=${PAGE}&offset=${offset}`);
    const d = await r.json();
    setRows(d.rows ?? []); setTotal(d.total ?? 0); setMissing(!!d.missing);
  }, [discipline, q, offset]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setOffset(0); setPick(null); }, [discipline, q]);

  async function apply() {
    if (!pick || !materialId) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/pumsem-items/apply", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: pick.id, materialId: Number(materialId), discipline }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(d.error ?? "적용 실패"); return; }
    setMsg(`적용했습니다.${d.createdLabor?.length ? ` 노임표에 없던 직종(${d.createdLabor.join(", ")})은 단가 0원으로 추가했으니 노임단가를 입력하세요.` : ""}`);
    setPick(null); setMaterialId("");
    onApplied();
  }

  return (
    <section className="bg-white border rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold">📖 표준품셈 책에서 찾아 적용</h2>
        <p className="text-xs text-gray-400 mt-1">공종·규격으로 검색해 항목을 고르고, 내 자재를 선택하면 직종별 공수가 그 자재의 품셈으로 복사됩니다. (자동 추출본이므로 ‘확인’ 표시 항목은 원문과 대조하세요.)</p>
      </div>
      {missing ? (
        <p className="text-xs text-gray-400">표준품셈 책 데이터가 아직 준비되지 않았습니다.</p>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="공종·규격 검색 (예: 전선관 후강 28, 케이블 트레이)" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="max-h-72 overflow-y-auto border rounded-lg divide-y text-xs">
            {rows.length === 0 && <p className="p-3 text-gray-400">{q ? "검색 결과가 없습니다." : "등록된 항목이 없습니다."}</p>}
            {rows.map((it) => (
              <button key={it.id} onClick={() => setPick(it)} className={`block w-full text-left px-3 py-2 hover:bg-blue-50 ${pick?.id === it.id ? "bg-blue-50" : ""}`}>
                <div className="font-medium">{it.title}{it.spec ? ` · ${it.spec}` : ""} <span className="text-gray-400 font-normal">/ {it.unit || "단위 미상"}</span>{it.review && <span className="ml-1 text-amber-600">⚠확인</span>}</div>
                <div className="text-gray-400">{it.chapter}{it.section ? ` > ${it.section}` : ""}{it.page ? ` · p.${it.page}` : ""} — {it.labors.map((l) => `${l.name} ${l.factor}`).join(", ") || "공수 없음"}</div>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{total.toLocaleString()}건</span>
            <span className="space-x-2">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="px-2 py-1 border rounded disabled:opacity-40">이전</button>
              <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="px-2 py-1 border rounded disabled:opacity-40">다음</button>
            </span>
          </div>
          {pick && (
            <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
              <div className="text-xs">선택: <b>{pick.title}{pick.spec ? ` · ${pick.spec}` : ""}</b> ({pick.labors.map((l) => `${l.name} ${l.factor}`).join(", ")} / {pick.unit || "단위"})</div>
              <MaterialPicker discipline={discipline} value={materialId} onChange={(id) => setMaterialId(id)} />
              <button onClick={apply} disabled={busy || !materialId} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs disabled:opacity-40">{busy ? "적용 중..." : "이 자재에 적용 (기존 공수 대체)"}</button>
            </div>
          )}
          {msg && <p className="text-xs text-blue-700">{msg}</p>}
        </>
      )}
    </section>
  );
}
