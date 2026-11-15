"use client";
import { useEffect, useState } from "react";

type Item = { materialId: number; name: string; spec: string };

// "품셈 없음" 품목에 공수를 바로 입력하는 줄. 저장하면 표준품셈에 등록되어 노무비가 즉시 반영됩니다.
type Sug = { item: { id: number; title: string; spec: string; unit: string; labors: Array<{ name: string; factor: number }> }; score: number; confident: boolean };

export default function FixLabor({ items, laborRates, discipline, onSaved }: { items: Item[]; laborRates: Array<{ code: string; name: string }>; discipline: string; onSaved: () => void }) {
  const [sugs, setSugs] = useState<Record<number, Sug[]>>({});
  const [applying, setApplying] = useState(false);
  const key = items.slice(0, 8).map((i) => i.materialId).join(",");
  useEffect(() => {
    let off = false;
    if (!key) return;
    fetch("/api/pumsem-items/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ discipline, items: items.slice(0, 8) }) })
      .then((r) => r.json()).then((d) => { if (!off && d.suggestions) setSugs(d.suggestions); }).catch(() => {});
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, discipline]);

  async function applySug(materialId: number, itemId: number): Promise<boolean> {
    const res = await fetch("/api/pumsem-items/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ discipline, materialId, itemId, replace: true }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error ?? "적용 실패"); return false; }
    return true;
  }
  async function applyOne(materialId: number, itemId: number) {
    setApplying(true); setMsg(null);
    const ok = await applySug(materialId, itemId);
    setApplying(false);
    if (ok) onSaved();
  }
  const confidentList = items.slice(0, 8).map((it) => ({ it, s: (sugs[it.materialId] ?? []).find((x) => x.confident) })).filter((x) => x.s);
  async function applyAllConfident() {
    setApplying(true); setMsg(null);
    for (const { it, s } of confidentList) { if (!(await applySug(it.materialId, s!.item.id))) break; }
    setApplying(false); onSaved();
  }

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

  if (laborRates.length === 0 && Object.keys(sugs).length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {confidentList.length > 0 && (
        <button disabled={applying} onClick={applyAllConfident} className="bg-green-700 text-white rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-50">
          추천 {confidentList.length}건 한 번에 적용 (이름·규격이 일치하는 항목만)
        </button>
      )}
      {items.slice(0, 8).map((it) => (
        <div key={it.materialId} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="min-w-[140px] flex-1 truncate">{it.name} <span className="text-amber-800/60">{it.spec}</span></span>
          <select value={get(it.materialId).code} onChange={(e) => setVals((s) => ({ ...s, [it.materialId]: { ...get(it.materialId), code: e.target.value } }))} className="border rounded px-1.5 py-1 bg-white">
            {laborRates.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <input type="number" min="0" step="any" placeholder="단위당 공수" value={get(it.materialId).factor}
            onChange={(e) => setVals((s) => ({ ...s, [it.materialId]: { ...get(it.materialId), factor: e.target.value } }))} className="border rounded px-1.5 py-1 w-24 text-right bg-white" />
          <button disabled={busyId === it.materialId} onClick={() => save(it)} className="bg-amber-700 text-white rounded px-2 py-1 font-semibold disabled:opacity-50">공수 저장</button>
          {(sugs[it.materialId] ?? []).length > 0 && (
            <div className="basis-full pl-2 space-y-1">
              {(sugs[it.materialId] ?? []).map((sg) => (
                <div key={sg.item.id} className="flex flex-wrap items-center gap-2 text-[11px] text-gray-700">
                  {sg.confident && <span className="bg-green-100 text-green-800 rounded-full px-1.5 py-0.5 font-semibold">추천</span>}
                  <span className="truncate max-w-[320px]">{sg.item.title} <span className="text-gray-400">{sg.item.spec} {sg.item.unit && `(${sg.item.unit})`}</span></span>
                  <span className="text-gray-500">{sg.item.labors.map((l) => `${l.name} ${l.factor}`).join(", ")}</span>
                  <button disabled={applying} onClick={() => applyOne(it.materialId, sg.item.id)} className="border border-amber-700 text-amber-800 rounded px-1.5 py-0.5 font-semibold disabled:opacity-50">이 품셈 적용</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {items.length > 8 && <p className="text-[11px] text-amber-800/70">나머지 {items.length - 8}개는 &lsquo;표준품셈&rsquo; 탭에서 입력하세요.</p>}
      {msg && <p className="text-red-600 text-xs">{msg}</p>}
    </div>
  );
}
