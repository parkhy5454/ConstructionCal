"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import type { Material, Discipline } from "@/lib/calc";
import DisciplineTabs, { loadSavedDiscipline, saveDiscipline } from "@/app/app/DisciplineTabs";

export default function PricesPage() {
  const [discipline, setDiscipline] = useState<Discipline>("electrical");
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ category: "", name: "", spec: "", unit: "", price: "" });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE = 50;
  const [upMsg, setUpMsg] = useState<string | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upFile, setUpFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ total: number; toAdd: number; toUpdate: number; unchanged: number; duplicatesInFile: number; skipped: number; warnings: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDiscipline(loadSavedDiscipline()); }, []);

  // 자재가 수만 개일 수 있어 검색어와 쪽 번호로 50개씩만 불러옵니다.
  const load = useCallback(async (d: Discipline, query = q, pg = page) => {
    setLoading(true);
    const res = await fetch(`/api/materials?discipline=${d}&limit=${PAGE}&offset=${pg * PAGE}&q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setRows(data.materials ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [q, page]);
  useEffect(() => { const t = setTimeout(() => load(discipline, q, page), q ? 250 : 0); return () => clearTimeout(t); }, [discipline, q, page, load]);

  function changeDiscipline(d: Discipline) {
    setDiscipline(d);
    saveDiscipline(d);
    setQ(""); setPage(0); setUpFile(null); setPreview(null); setUpMsg(null);
  }

  async function sendUpload(mode: "preview" | "apply") {
    if (!upFile) return;
    setUpBusy(true); setUpMsg(null);
    const fd = new FormData();
    fd.append("file", upFile); fd.append("discipline", discipline); fd.append("mode", mode);
    try {
      const res = await fetch("/api/materials/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { setUpMsg(d.error ?? "업로드 실패"); setPreview(null); }
      else if (mode === "preview") setPreview(d.summary);
      else { setUpMsg(`등록 완료: 새 자재 ${d.inserted.toLocaleString()}개 추가, 단가 ${d.updated.toLocaleString()}개 변경`); setPreview(null); setUpFile(null); if (fileRef.current) fileRef.current.value = ""; setQ(""); setPage(0); load(discipline, "", 0); }
    } catch { setUpMsg("네트워크 오류가 발생했습니다."); }
    setUpBusy(false);
  }

  async function savePrice(id: number, price: number) {
    await fetch(`/api/materials/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price }),
    });
    load(discipline, q, page);
  }

  async function remove(id: number) {
    await fetch(`/api/materials/${id}`, { method: "DELETE" });
    load(discipline, q, page);
  }

  async function addMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/materials", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, discipline, price: Number(form.price) || 0 }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "추가 실패"); return; }
    setForm({ category: "", name: "", spec: "", unit: "", price: "" });
    load(discipline, q, page);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">💰 물가정보</h1>
        <p className="text-xs text-gray-400 mt-1">
          자재단가 DB. 실제 서비스에서는 매월 구매한 물가자료(종합물가정보 등)로 이 표의 단가를 교체합니다. 업종마다 자재 체계가 다르므로 아래에서 업종을 선택하세요.
        </p>
      </div>

      <DisciplineTabs value={discipline} onChange={changeDiscipline} />

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="자재 검색 (예: 배선용차단기 3P 100A)"
          className="border rounded-lg px-3 py-1.5 text-xs flex-1 min-w-[220px] bg-white" />
        <span className="text-xs text-gray-400">{total.toLocaleString()}개</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">{q ? "검색 결과가 없습니다." : "이 업종에는 아직 등록된 자재가 없습니다. 아래에서 추가하거나 표를 업로드하세요."}</p>
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

      {total > PAGE && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="border rounded px-2 py-1 disabled:opacity-40">이전</button>
          <span>{page + 1} / {Math.ceil(total / PAGE).toLocaleString()}</span>
          <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)} className="border rounded px-2 py-1 disabled:opacity-40">다음</button>
        </div>
      )}

      <section className="bg-white border rounded-xl p-3 space-y-2">
        <h2 className="text-xs font-bold">표로 한꺼번에 등록 (.xlsx · .csv · .tsv)</h2>
        <p className="text-[11px] text-gray-400">열: 분류, 품명, 규격, 단위, 단가, 제조사(선택). 첫 줄에 머리글이 있으면 자동으로 찾습니다. 같은 품명·규격·단위가 있으면 단가만 바꾸고, 없으면 새로 추가합니다. 제조사별 단가는 규격 뒤 [제조사]가 붙은 별도 자재로 들어갑니다. 4MB·6만 행까지.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" className="text-xs"
            onChange={(e) => { setUpFile(e.target.files?.[0] ?? null); setPreview(null); setUpMsg(null); }} />
          <button disabled={!upFile || upBusy} onClick={() => sendUpload("preview")} className="text-xs border rounded-lg px-3 py-1.5 disabled:opacity-40">미리보기</button>
          {preview && <button disabled={upBusy || (preview.toAdd + preview.toUpdate === 0)} onClick={() => sendUpload("apply")} className="text-xs bg-black text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-40">{upBusy ? "등록 중..." : "등록"}</button>}
        </div>
        {preview && (
          <p className="text-xs text-gray-600">
            읽은 행 {preview.total.toLocaleString()}개 → 새로 추가 <b>{preview.toAdd.toLocaleString()}</b> · 단가 변경 <b>{preview.toUpdate.toLocaleString()}</b> · 변경 없음 {preview.unchanged.toLocaleString()}
            {preview.duplicatesInFile > 0 && ` · 파일 안 중복 ${preview.duplicatesInFile.toLocaleString()}`}{preview.skipped > 0 && ` · 단가·단위 없어 제외 ${preview.skipped.toLocaleString()}`}
            {preview.warnings.map((w, i) => <span key={i} className="block text-amber-700">{w}</span>)}
          </p>
        )}
        {upMsg && <p className="text-xs text-gray-700">{upMsg}</p>}
      </section>

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
