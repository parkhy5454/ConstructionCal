"use client";
import { useState } from "react";

// DB에 없는 자재를 즉석에서 등록(+선택: 표준품셈 공수)하고 이 견적서에 바로 넣습니다.
export default function QuickAdd({
  projectId, laborRates, defaultGroup, onAdded,
}: {
  projectId: string; laborRates: Array<{ code: string; name: string }>; defaultGroup: string; onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ groupName: defaultGroup, name: "", spec: "", unit: "", price: "", qty: "1", laborCode: laborRates[0]?.code ?? "", factor: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/projects/${projectId}/bom/quick`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, price: Number(f.price || 0), qty: Number(f.qty || 0), factor: f.factor === "" ? undefined : Number(f.factor) }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error ?? "추가 실패"); return; }
    setF((s) => ({ ...s, name: "", spec: "", price: "", qty: "1", factor: "" }));
    setMsg("추가했습니다. 자재 단가는 '물가정보' 탭에도 등록되었습니다.");
    onAdded();
  }

  return (
    <div className="mt-3 border-t pt-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-[#1f6f54] font-semibold underline">
        {open ? "닫기" : "+ 목록에 없는 자재 직접 추가 (단가·공수 입력)"}
      </button>
      {open && (
        <form onSubmit={submit} className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <input required value={f.groupName} onChange={set("groupName")} placeholder="공종" className="border rounded-lg px-2 py-1.5" />
          <input required value={f.name} onChange={set("name")} placeholder="품명" className="border rounded-lg px-2 py-1.5" />
          <input value={f.spec} onChange={set("spec")} placeholder="규격" className="border rounded-lg px-2 py-1.5" />
          <input required value={f.unit} onChange={set("unit")} placeholder="단위 (M, 개, 식…)" className="border rounded-lg px-2 py-1.5" />
          <input type="number" min="0" step="any" value={f.price} onChange={set("price")} placeholder="재료비 단가(원)" className="border rounded-lg px-2 py-1.5" />
          <input type="number" min="0" step="any" value={f.qty} onChange={set("qty")} placeholder="수량" className="border rounded-lg px-2 py-1.5" />
          <select value={f.laborCode} onChange={set("laborCode")} className="border rounded-lg px-2 py-1.5">
            {laborRates.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <input type="number" min="0" step="any" value={f.factor} onChange={set("factor")} placeholder="단위당 공수(선택)" className="border rounded-lg px-2 py-1.5" />
          <div className="col-span-2 sm:col-span-4 flex items-center gap-3">
            <button disabled={busy} className="bg-black text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">자재 등록하고 견적에 추가</button>
            {msg && <span className="text-gray-600">{msg}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
