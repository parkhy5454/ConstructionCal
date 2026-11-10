"use client";
import { useEffect, useState } from "react";

type Preview = { name: string; rows: string[][]; totalRows: number };
export type Mapping = { sheet: string; headerRow: number; name: number; spec: number; unit: number; qty: number[]; price: number };

const LETTERS = "ABCDEFGHIJKLMN".split("");
const has = (s: string, words: string[]) => words.some((w) => s.replace(/\s+/g, "").startsWith(w));

// 앞부분 행에서 헤더로 보이는 행과 열을 추측해 기본값으로 채웁니다.
function guess(p: Preview): Omit<Mapping, "sheet"> {
  const g = { headerRow: 1, name: 1, spec: 0, unit: 0, qty: [] as number[], price: 0 };
  for (let r = 0; r < p.rows.length; r++) {
    const line = p.rows[r];
    const qtyCols = line.map((v, i) => (has(v, ["수량", "물량"]) ? i + 1 : 0)).filter(Boolean);
    const nameCol = line.findIndex((v) => has(v, ["품명", "품목", "명칭", "자재", "재료", "내역", "항목"])) + 1;
    if (qtyCols.length && nameCol) {
      g.headerRow = r + 1;
      g.name = nameCol;
      g.qty = qtyCols.slice(0, 1);
      g.spec = line.findIndex((v, i) => i + 1 !== nameCol && has(v, ["규격", "사양", "모델"])) + 1;
      g.unit = line.findIndex((v) => has(v, ["단위"])) + 1;
      g.price = line.findIndex((v) => v.includes("단가")) + 1;
      return g;
    }
  }
  return g;
}

export default function ColumnMapper({ projectId, file, onApply, onCancel, busy }: {
  projectId: string; file: File; onApply: (m: Mapping) => void; onCancel: () => void; busy: boolean;
}) {
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState("");
  const [m, setM] = useState<Omit<Mapping, "sheet">>({ headerRow: 1, name: 1, spec: 0, unit: 0, qty: [], price: 0 });

  useEffect(() => {
    (async () => {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "preview");
      const res = await fetch(`/api/projects/${projectId}/excel-import`, { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? "미리보기를 불러오지 못했습니다."); return; }
      const list: Preview[] = d.preview ?? [];
      setPreviews(list);
      if (list[0]) { setSheet(list[0].name); setM(guess(list[0])); }
    })();
  }, [file, projectId]);

  const cur = previews?.find((p) => p.name === sheet);
  const colSelect = (label: string, key: "name" | "spec" | "unit" | "price", required = false) => (
    <label className="text-xs flex items-center gap-1.5">
      <span className="w-12 text-gray-600">{label}{required && <span className="text-red-500">*</span>}</span>
      <select value={m[key]} onChange={(e) => setM({ ...m, [key]: Number(e.target.value) })} className="border rounded px-1.5 py-1 bg-white">
        {!required && <option value={0}>(없음)</option>}
        {LETTERS.map((l, i) => <option key={l} value={i + 1}>{l}열</option>)}
      </select>
    </label>
  );
  const canApply = !!cur && m.name > 0 && m.qty.length > 0 && !busy;

  return (
    <section className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">열 직접 지정</h2>
        <button onClick={onCancel} className="text-xs text-gray-500 underline">닫기</button>
      </div>
      <p className="text-xs text-gray-500">
        표에서 <b>헤더(품명·수량 제목)가 있는 행 번호</b>를 눌러 지정하고, 각 항목이 어느 열인지 고르세요.
        층별로 수량이 열로 나뉘어 있으면 수량 열을 <b>여러 개 체크</b>하면 합산합니다. 지정한 시트 한 장만 가져옵니다.
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      {!previews && !err && <p className="text-xs text-gray-400">불러오는 중...</p>}
      {previews && previews.length > 1 && (
        <select value={sheet} onChange={(e) => { setSheet(e.target.value); const p = previews.find((x) => x.name === e.target.value); if (p) setM(guess(p)); }} className="border rounded px-2 py-1 text-xs bg-white">
          {previews.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      )}
      {cur && (
        <>
          <div className="overflow-auto max-h-72 border rounded-lg">
            <table className="text-[11px] w-full border-collapse">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="px-1.5 py-1 text-left text-gray-400">행</th>
                  {LETTERS.map((l, i) => (
                    <th key={l} className={`px-1.5 py-1 ${i + 1 === m.name || m.qty.includes(i + 1) ? "bg-[#e3efe8] text-[#1f6f54]" : "text-gray-500"}`}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cur.rows.map((line, r) => (
                  <tr key={r} className={r + 1 === m.headerRow ? "bg-amber-50" : r + 1 < m.headerRow ? "opacity-40" : ""}>
                    <td className="px-1.5 py-0.5">
                      <button type="button" onClick={() => setM({ ...m, headerRow: r + 1 })} className="underline text-gray-500" title="이 행을 헤더로 지정">{r + 1}</button>
                    </td>
                    {line.map((v, c) => <td key={c} className="px-1.5 py-0.5 whitespace-nowrap border-t max-w-[160px] overflow-hidden text-ellipsis">{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cur.totalRows > 40 && <p className="text-[11px] text-gray-400">앞 40행만 미리 보여줍니다(전체 {cur.totalRows}행). 지정한 헤더 행 아래 전체를 읽습니다.</p>}
          <p className="text-xs">헤더 행: <b>{m.headerRow}행</b> (이 아래부터 읽습니다)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {colSelect("품명", "name", true)}
            {colSelect("규격", "spec")}
            {colSelect("단위", "unit")}
            {colSelect("단가", "price")}
          </div>
          <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-gray-600">수량<span className="text-red-500">*</span></span>
            {LETTERS.map((l, i) => (
              <label key={l} className="flex items-center gap-1">
                <input type="checkbox" checked={m.qty.includes(i + 1)} onChange={(e) => setM({ ...m, qty: e.target.checked ? [...m.qty, i + 1].sort((a, b) => a - b) : m.qty.filter((q) => q !== i + 1) })} />
                {l}
              </label>
            ))}
          </div>
          <button disabled={!canApply} onClick={() => onApply({ sheet, ...m })} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
            {busy ? "읽는 중..." : "이 설정으로 읽기"}
          </button>
        </>
      )}
    </section>
  );
}
