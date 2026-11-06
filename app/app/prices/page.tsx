"use client";
import { useEffect, useState, useCallback } from "react";
import type { Material } from "@/lib/calc";

export default function PricesPage() {
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "", name: "", spec: "", unit: "", price: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/materials");
    const data = await res.json();
    setRows(data.materials ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function savePrice(id: number, price: number) {
    await fetch(`/api/materials/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price }),
    });
    load();
  }

  async function remove(id: number) {
    await fetch(`/api/materials/${id}`, { method: "DELETE" });
    load();
  }

  async function addMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/materials", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, price: Number(form.price) || 0 }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "추가 실패"); return; }
    setForm({ category: "", name: "", spec: "", unit: "", price: "" });
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">💰 물가정보</h1>
        <p className="text-xs text-gray-400 mt-1">
          자재단가 DB. 실제 서비스에서는 매월 구매한 물가자료(종합물가정보 등)로 이 표의 단가를 교체합니다.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-left bg-gray-50">
                <th className="py-2 px-3">분류</th><th className="py-2 px-3">품명</th><th className="py-2 px-3">규격</th>
                <th className="py-2 px-3">단위</th><th className="py-2 px-3 text-right">단가(원)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-1.5 px-3 text-gray-400">{m.category}</td>
                  <td className="py-1.5 px-3 font-medium">{m.name}</td>
                  <td className="py-1.5 px-3 text-gray-500">{m.spec}</td>
                  <td className="py-1.5 px-3">{m.unit}</td>
                  <td className="py-1.5 px-3 text-right">
                    <input type="number" min="0" defaultValue={m.price}
                      onBlur={(e) => { const v = Number(e.target.value); if (isFinite(v) && v !== m.price) savePrice(m.id, v); }}
                      className="w-24 text-right border rounded px-1.5 py-1" />
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    <button onClick={() => remove(m.id)} className="text-gray-400 hover:text-red-600">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={addMaterial} className="bg-white border rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <input placeholder="분류" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs w-20" />
        <input placeholder="품명" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[120px]" />
        <input placeholder="규격" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[120px]" />
        <input placeholder="단위" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs w-16" />
        <input placeholder="단가" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="border rounded-lg px-2 py-1.5 text-xs w-24 text-right" />
        <button disabled={busy} className="bg-black text-white rounded-lg px-3 py-1.5 text-xs font-semibold">추가</button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
