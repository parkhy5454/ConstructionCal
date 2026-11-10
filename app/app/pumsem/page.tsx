"use client";
import { useEffect, useState, useCallback } from "react";
import { computeIlwidaega, fmt } from "@/lib/calc";
import type { Material, LaborRate, Pumsem, Discipline } from "@/lib/calc";
import DisciplineTabs, { loadSavedDiscipline, saveDiscipline } from "@/app/app/DisciplineTabs";

export default function PumsemPage() {
  const [discipline, setDiscipline] = useState<Discipline>("electrical");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [laborRates, setLaborRates] = useState<LaborRate[]>([]);
  const [rows, setRows] = useState<Array<Pumsem & { id: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ materialId: "", laborCode: "", factor: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDiscipline(loadSavedDiscipline()); }, []);

  const load = useCallback(async (d: Discipline) => {
    setLoading(true);
    // 처음 여는 업종은 자재를 먼저 불러 기본 데이터가 준비된 뒤 노임·품셈을 읽습니다(동시 시드 충돌 방지).
    const mRes = await fetch(`/api/materials?discipline=${d}`);
    const [lRes, pRes] = await Promise.all([fetch(`/api/labor-rates?discipline=${d}`), fetch(`/api/pumsem?discipline=${d}`)]);
    const [mData, lData, pData] = await Promise.all([mRes.json(), lRes.json(), pRes.json()]);
    setMaterials(mData.materials ?? []);
    setLaborRates(lData.laborRates ?? []);
    setRows(pData.pumsem ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(discipline); }, [discipline, load]);

  function changeDiscipline(d: Discipline) {
    setDiscipline(d);
    saveDiscipline(d);
  }

  async function saveFactor(id: number, factor: number) {
    await fetch(`/api/pumsem/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ factor }),
    });
    load(discipline);
  }
  async function remove(id: number) {
    await fetch(`/api/pumsem/${id}`, { method: "DELETE" });
    load(discipline);
  }
  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    if (!form.materialId || !form.laborCode) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/pumsem", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId: Number(form.materialId), laborCode: form.laborCode, factor: Number(form.factor) || 0 }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "추가 실패"); return; }
    setForm({ materialId: "", laborCode: "", factor: "" });
    load(discipline);
  }

  const matById = new Map(materials.map((m) => [m.id, m]));
  const laborById = new Map(laborRates.map((l) => [l.code, l]));
  const ild = computeIlwidaega(materials, rows, laborRates);
  const matIdsInPumsem = new Set(rows.map((r) => r.materialId));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold">📐 표준품셈</h1>
        <p className="text-xs text-gray-400 mt-1">자재 1단위를 시공하는 데 필요한 단위당 공수(인/단위)를 관리합니다. 업종별로 표준품셈 책이 다르므로 아래에서 업종을 선택하세요.</p>
      </div>

      <DisciplineTabs value={discipline} onChange={changeDiscipline} />

      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : (
        <>
          <section className="bg-white border rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left bg-gray-50">
                  <th className="py-2 px-3">품명 / 규격</th><th className="py-2 px-3">단위</th><th className="py-2 px-3">직종</th>
                  <th className="py-2 px-3 text-right">단위당공수</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const mat = matById.get(r.materialId);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5 px-3"><span className="font-medium">{mat?.name}</span> <span className="text-gray-400">{mat?.spec}</span></td>
                      <td className="py-1.5 px-3">{mat?.unit}</td>
                      <td className="py-1.5 px-3">{laborById.get(r.laborCode)?.name ?? r.laborCode}</td>
                      <td className="py-1.5 px-3 text-right">
                        <input type="number" min="0" step="0.001" defaultValue={r.factor}
                          onBlur={(e) => { const v = Number(e.target.value); if (isFinite(v) && v !== r.factor) saveFactor(r.id, v); }}
                          className="w-20 text-right border rounded px-1.5 py-1" />
                      </td>
                      <td className="py-1.5 px-3 text-right"><button onClick={() => remove(r.id)} className="text-gray-400 hover:text-red-600">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <form onSubmit={addRow} className="flex flex-wrap gap-2 items-center p-3 border-t">
              <select value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[160px]">
                <option value="">자재 선택 (품셈 미등록)...</option>
                {materials.filter((m) => !matIdsInPumsem.has(m.id)).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.spec || m.unit})</option>
                ))}
              </select>
              <select value={form.laborCode} onChange={(e) => setForm({ ...form, laborCode: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs w-28">
                <option value="">직종 선택</option>
                {laborRates.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
              <input type="number" min="0" step="0.001" placeholder="공수" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs w-20 text-right" />
              <button disabled={busy} className="bg-black text-white rounded-lg px-3 py-1.5 text-xs font-semibold">추가</button>
            </form>
            {error && <p className="text-xs text-red-600 px-3 pb-2">{error}</p>}
          </section>

          <section className="bg-white border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-1">일위대가 (자동 결합)</h2>
            <p className="text-xs text-gray-400 mb-3">자재단가 × 품셈공수 × 노임단가를 결합한 품목 1단위당 금액입니다.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 text-left">
                    <th className="py-1.5 pr-2">품명 / 규격</th><th className="py-1.5 pr-2">단위</th>
                    <th className="py-1.5 pr-2 text-right">재료비단가</th><th className="py-1.5 pr-2 text-right">노무비단가</th>
                    <th className="py-1.5 text-right">일위대가(계)</th>
                  </tr>
                </thead>
                <tbody>
                  {ild.map((i) => (
                    <tr key={i.materialId} className="border-t">
                      <td className="py-1.5 pr-2"><span className="font-medium">{i.name}</span> <span className="text-gray-400">{i.spec}</span></td>
                      <td className="py-1.5 pr-2">{i.unit}</td>
                      <td className="py-1.5 pr-2 text-right">{fmt(i.matPrice)}</td>
                      <td className="py-1.5 pr-2 text-right">{fmt(i.laborPrice)}</td>
                      <td className="py-1.5 text-right font-semibold">{fmt(i.sum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
