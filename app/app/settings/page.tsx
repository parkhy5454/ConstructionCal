"use client";
import { useEffect, useState, useCallback } from "react";
import type { LaborRate, RateSettings, Discipline } from "@/lib/calc";
import DisciplineTabs, { loadSavedDiscipline, saveDiscipline } from "@/app/app/DisciplineTabs";

const RATE_LABELS: Record<keyof RateSettings, string> = {
  indirectLabor: "간접노무비 (직접노무비의 %)",
  etcExpense: "기타경비 (재료비+노무비의 %)",
  industrialIns: "산재보험료 (노무비의 %)",
  employIns: "고용보험료 (노무비의 %)",
  gna: "일반관리비 (순공사비의 %)",
  profit: "이윤 (노무비+경비+일반관리비의 %)",
  vat: "부가가치세 (계의 %)",
  pipeAccessory: "배관부속재 (전선관 재료비의 %)",
  consumable: "소모잡자재 (전선관+전선 재료비의 %)",
  toolLoss: "공구손료 (노무비의 %)",
};

export default function SettingsPage() {
  const [discipline, setDiscipline] = useState<Discipline>("electrical");
  const [laborRates, setLaborRates] = useState<Array<LaborRate & { id: number }>>([]);
  const [rates, setRates] = useState<RateSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [newLabor, setNewLabor] = useState({ code: "", name: "", rate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDiscipline(loadSavedDiscipline()); }, []);

  const load = useCallback(async (d: Discipline) => {
    setLoading(true);
    const [lRes, rRes] = await Promise.all([fetch(`/api/labor-rates?discipline=${d}`), fetch(`/api/rate-settings?discipline=${d}`)]);
    const [lData, rData] = await Promise.all([lRes.json(), rRes.json()]);
    setLaborRates(lData.laborRates ?? []);
    setRates(rData.rates ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { load(discipline); }, [discipline, load]);

  function changeDiscipline(d: Discipline) {
    setDiscipline(d);
    saveDiscipline(d);
  }

  async function saveLaborRate(id: number, rate: number) {
    await fetch(`/api/labor-rates/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rate }),
    });
    load(discipline);
  }
  async function removeLaborRate(id: number) {
    await fetch(`/api/labor-rates/${id}`, { method: "DELETE" });
    load(discipline);
  }
  async function addLaborRate(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabor.code.trim() || !newLabor.name.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/labor-rates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newLabor, discipline, rate: Number(newLabor.rate) || 0 }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "추가 실패"); return; }
    setNewLabor({ code: "", name: "", rate: "" });
    load(discipline);
  }
  async function saveRate(key: keyof RateSettings, pct: number) {
    const v = pct / 100;
    setRates((prev) => (prev ? { ...prev, [key]: v } : prev));
    await fetch("/api/rate-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: v, discipline }),
    });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">⚙️ 설정</h1>

      <DisciplineTabs value={discipline} onChange={changeDiscipline} />

      {loading || !rates ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : (
        <>
          <section className="bg-white border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">노임단가 <span className="text-[10px] text-gray-400">대한건설협회 공표 기준</span></h2>
            <div className="space-y-2">
              {laborRates.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <div className="text-sm">{l.name} <span className="text-xs text-gray-400">직종코드 {l.code}</span></div>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" step="100" defaultValue={l.rate}
                      onBlur={(e) => { const v = Number(e.target.value); if (isFinite(v) && v !== l.rate) saveLaborRate(l.id, v); }}
                      className="w-28 text-right border rounded px-2 py-1 text-sm" />
                    <button onClick={() => removeLaborRate(l.id)} className="text-gray-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                </div>
              ))}
              {laborRates.length === 0 && <p className="text-xs text-gray-400">이 업종에는 아직 등록된 노임단가가 없습니다.</p>}
            </div>
            <form onSubmit={addLaborRate} className="mt-3 pt-3 border-t flex flex-wrap gap-2 items-center">
              <input placeholder="직종코드" value={newLabor.code} onChange={(e) => setNewLabor({ ...newLabor, code: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs w-20" />
              <input placeholder="직종명" value={newLabor.name} onChange={(e) => setNewLabor({ ...newLabor, name: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[100px]" />
              <input type="number" placeholder="단가" value={newLabor.rate} onChange={(e) => setNewLabor({ ...newLabor, rate: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs w-24 text-right" />
              <button disabled={busy} className="bg-black text-white rounded-lg px-3 py-1.5 text-xs font-semibold">추가</button>
            </form>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </section>

          <section className="bg-white border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">원가 계산 비율</h2>
            <div className="space-y-2">
              {(Object.keys(RATE_LABELS) as Array<keyof RateSettings>).map((key) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <div className="text-sm">{RATE_LABELS[key]}</div>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" step="0.01" defaultValue={(rates[key] * 100).toFixed(2)}
                      onBlur={(e) => { const v = Number(e.target.value); if (isFinite(v)) saveRate(key, v); }}
                      className="w-20 text-right border rounded px-2 py-1 text-sm" />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
