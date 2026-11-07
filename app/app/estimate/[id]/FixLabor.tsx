"use client";
import { useState } from "react";

type Item = { materialId: number; name: string; spec: string };

// "품셈 없음" 품목에 공수를 바로 입력하는 줄. 저장하면 표준품셈에 등록되어 노무비가 즉시 반영됩니다.
export default function FixLabor({ items, laborRates, onSaved }: { items: Item[]; laborRates: Array<{ code: string; name: string }>; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<number, { code: string; factor: string }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const get = (id: number) => vals[id] ?? { code: laborRates[0]?.code ?? "", factor: "" };

  async function save(it: Item) {
    const v = get(it.materialId);
    const factor = Number(v.factor);
    if (!v.code || !isFinite(factor) || factor <= 0) { setMsg("직종과 0보다 큰 공수를 입력하세요."); return; }
    setBusyId(it.materialId); setMsg(null);
    const res = await fetch("/api/pumsem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialId: it.materialId, laborCode: v.code, factor }) });
    const d = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) { setMsg(d.error ?? "저장 실패"); return; }
    onSaved();
  }

  if (laborRates.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {items.slice(0, 8).map((it) => (
        <div key={it.materialId} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="min-w-[140px] flex-1 truncate">{it.name} <span className="text-amber-800/60">{it.spec}</span></span>
          <select value={get(it.materialId).code} onChange={(e) => setVals((s) => ({ ...s, [it.materialId]: { ...get(it.materialId), code: e.target.value } }))} className="border rounded px-1.5 py-1 bg-white">
            {laborRates.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <input type="number" min="0" step="any" placeholder="단위당 공수" value={get(it.materialId).factor}
            onChange={(e) => setVals((s) => ({ ...s, [it.materialId]: { ...get(it.materialId), factor: e.target.value } }))} className="border rounded px-1.5 py-1 w-24 text-right bg-white" />
          <button disabled={busyId === it.materialId} onClick={() => save(it)} className="bg-amber-700 text-white rounded px-2 py-1 font-semibold disabled:opacity-50">공수 저장</button>
        </div>
      ))}
      {items.length > 8 && <p className="text-[11px] text-amber-800/70">나머지 {items.length - 8}개는 &lsquo;표준품셈&rsquo; 탭에서 입력하세요.</p>}
      {msg && <p className="text-red-600 text-xs">{msg}</p>}
    </div>
  );
}
