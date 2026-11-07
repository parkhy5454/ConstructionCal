"use client";
import { useState } from "react";
import Link from "next/link";
import type { Surcharge } from "@/lib/calc";

type Meta = { surcharges: Surcharge[]; status: string; clientId: number | null; memo: string; priceBasis: string };

const STATUS: Array<[string, string]> = [["draft", "작성 중"], ["submitted", "제출"], ["won", "수주"], ["lost", "실주"]];
// 비율은 출발값 예시입니다. 현장·발주처 기준(표준품셈의 할증 규정)에 맞게 수정해서 쓰세요.
const PRESETS: Array<[string, number]> = [["고소작업 할증", 10], ["협소·지하 작업 할증", 10], ["야간작업 할증", 30]];

export default function SettingsPanel({
  projectId, meta, clients, groups, onSaved,
}: {
  projectId: string; meta: Meta; clients: Array<{ id: number; name: string }>; groups: string[]; onSaved: () => void;
}) {
  const [surcharges, setSurcharges] = useState<Surcharge[]>(meta.surcharges);
  const [memo, setMemo] = useState(meta.memo);
  const [basis, setBasis] = useState(meta.priceBasis ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirtySur = JSON.stringify(surcharges) !== JSON.stringify(meta.surcharges);

  async function put(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/projects/${projectId}/meta`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error ?? "저장 실패"); return false; }
    onSaved();
    return true;
  }

  const upd = (i: number, patch: Partial<Surcharge>) => setSurcharges((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const add = (label = "", percent = 10) =>
    setSurcharges((s) => (s.length >= 10 ? s : [...s, { id: Math.random().toString(36).slice(2, 10), label, percent, group: null }]));

  return (
    <section className="bg-white border rounded-xl p-4 space-y-4">
      <h2 className="text-sm font-bold">견적 설정</h2>

      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <label className="space-y-1">
          <span className="text-gray-500">진행 상태</span>
          <select value={meta.status} disabled={busy} onChange={(e) => put({ status: e.target.value })} className="w-full border rounded-lg px-2 py-1.5">
            {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-gray-500">거래처 (발주처) <Link href="/app/clients" className="underline text-gray-400 ml-1">관리</Link></span>
          <select value={meta.clientId ?? ""} disabled={busy} onChange={(e) => put({ clientId: e.target.value ? Number(e.target.value) : null })} className="w-full border rounded-lg px-2 py-1.5">
            <option value="">선택 안 함</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <label className="block text-xs space-y-1">
        <span className="text-gray-500">단가 기준 (제출 문서·공유 링크에 표기)</span>
        <input value={basis} maxLength={80} onChange={(e) => setBasis(e.target.value)}
          onBlur={() => { if (basis !== (meta.priceBasis ?? "")) put({ priceBasis: basis }); }}
          placeholder="예: 종합물가정보 2026년 11월호 서울 기준" className="w-full border rounded-lg px-2 py-1.5" />
      </label>

      <label className="block text-xs space-y-1">
        <span className="text-gray-500">내부 메모 (제출 문서에는 나오지 않음)</span>
        <textarea value={memo} maxLength={2000} rows={2} onChange={(e) => setMemo(e.target.value)}
          onBlur={() => { if (memo !== meta.memo) put({ memo }); }} className="w-full border rounded-lg px-2 py-1.5" />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold">노무비 할증·보정</h3>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([l, p]) => (
              <button key={l} type="button" onClick={() => add(l, p)} className="text-[11px] bg-gray-100 hover:bg-gray-200 rounded-full px-2.5 py-1">+ {l}</button>
            ))}
            <button type="button" onClick={() => add("", 10)} className="text-[11px] bg-gray-100 hover:bg-gray-200 rounded-full px-2.5 py-1">+ 직접 입력</button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400">현장 조건에 따라 노무비에 가산(또는 감산)하는 비율입니다. 아래 기본 비율은 예시이니 표준품셈의 할증 규정이나 발주처 기준에 맞게 고쳐 쓰세요. 적용 공종을 정하면 그 공종에만 반영됩니다.</p>
        {surcharges.length === 0 && <p className="text-xs text-gray-400">설정된 할증이 없습니다.</p>}
        {surcharges.map((s, i) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
            <input value={s.label} maxLength={30} onChange={(e) => upd(i, { label: e.target.value })} placeholder="항목 이름" className="border rounded-lg px-2 py-1.5 w-40" />
            <input type="number" step="0.5" value={s.percent} onChange={(e) => upd(i, { percent: Number(e.target.value) })} className="border rounded-lg px-2 py-1.5 w-20 text-right" />
            <span>%</span>
            <select value={s.group ?? ""} onChange={(e) => upd(i, { group: e.target.value || null })} className="border rounded-lg px-2 py-1.5">
              <option value="">전체 공종</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
              {s.group && !groups.includes(s.group) && <option value={s.group}>{s.group}</option>}
            </select>
            <button type="button" onClick={() => setSurcharges((x) => x.filter((_, k) => k !== i))} className="text-gray-400 hover:text-red-600">✕</button>
          </div>
        ))}
        {(dirtySur || surcharges.length > 0) && (
          <div className="flex items-center gap-2">
            <button disabled={busy || !dirtySur} onClick={() => put({ surcharges })} className="bg-black text-white rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40">할증 적용</button>
            {dirtySur && <span className="text-[11px] text-amber-600">저장하지 않은 변경이 있습니다.</span>}
          </div>
        )}
      </div>
      {msg && <p className="text-xs text-red-600">{msg}</p>}
    </section>
  );
}
