"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fmt } from "@/lib/calc";
import { buildSnapshot, diffSnapshots, type Snapshot } from "@/lib/versions";

type V = { id: number; label: string; createdAt: string; final: number | null };

export default function VersionsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [versions, setVersions] = useState<V[]>([]);
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [base, setBase] = useState<Snapshot | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const load = useCallback(async () => {
    const [vr, pr] = await Promise.all([fetch(`/api/projects/${projectId}/versions`), fetch(`/api/projects/${projectId}`)]);
    const vd = await vr.json().catch(() => ({}));
    const pd = await pr.json().catch(() => ({}));
    if (vr.ok) { setVersions(vd.versions ?? []); setTableMissing(!!vd.tableMissing); }
    if (pr.ok) setCurrent(buildSnapshot(pd.bom, pd.materials, pd.meta?.surcharges ?? [], pd.result));
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/projects/${projectId}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error ?? "저장 실패"); return; }
    setLabel(""); setMsg("현재 견적을 저장했습니다.");
    load();
  }
  async function openCompare(vid: number) {
    if (compareId === vid) { setCompareId(null); setBase(null); return; }
    const res = await fetch(`/api/projects/${projectId}/versions/${vid}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(d.error ?? "불러오기 실패"); return; }
    setCompareId(vid); setBase(d.snapshot);
  }
  async function restore(v: V) {
    if (!confirm(`'${v.label}' 상태로 되돌릴까요?\n현재 상태는 "복원 전 자동 저장" 버전으로 먼저 보관됩니다.`)) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/projects/${projectId}/versions/${v.id}/restore`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error ?? "복원 실패"); return; }
    setMsg(`복원했습니다. (${d.restored}개 품목${d.skipped ? `, 삭제된 자재 ${d.skipped}개는 제외` : ""})`);
    setCompareId(null); setBase(null);
    load();
  }
  async function remove(v: V) {
    if (!confirm(`'${v.label}' 버전을 삭제할까요?`)) return;
    await fetch(`/api/projects/${projectId}/versions/${v.id}`, { method: "DELETE" });
    if (compareId === v.id) { setCompareId(null); setBase(null); }
    load();
  }

  const diff = useMemo(() => (base && current ? diffSnapshots(base, current) : null), [base, current]);
  const label2 = (s: string) => ({ added: "추가", removed: "삭제", changed: "변경", same: "동일" } as Record<string, string>)[s];
  const color = (s: string) => ({ added: "text-green-700 bg-green-50", removed: "text-red-700 bg-red-50", changed: "text-amber-700 bg-amber-50", same: "text-gray-400" } as Record<string, string>)[s];

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/app/estimate/${projectId}`} className="text-xs text-gray-400 underline">← 견적서로</Link>
        <h1 className="text-lg font-bold mt-1">🕘 버전 이력</h1>
        <p className="text-xs text-gray-400 mt-0.5">제출 전후 등 중요한 시점에 저장해 두면, 나중에 현재 견적과 비교하거나 그 상태로 되돌릴 수 있습니다.</p>
      </div>

      <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-2 items-center">
        <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="저장본 이름 (예: 1차 제출본)" className="flex-1 min-w-[180px] border rounded-lg px-3 py-2 text-sm" />
        <button disabled={busy} onClick={save} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">현재 견적 저장</button>
        {current && <span className="text-xs text-gray-400 w-full">현재 견적금액 {fmt(current.totals.final)}원 (VAT 포함)</span>}
      </div>
      {msg && <p className="text-xs text-gray-600">{msg}</p>}
      {tableMissing && <p className="text-xs text-red-600">버전 이력 테이블이 아직 없습니다. 운영 DB에 npm run db:push를 실행하세요.</p>}

      {versions.length === 0 ? (
        <p className="text-sm text-gray-400">저장된 버전이 없습니다.</p>
      ) : (
        <div className="divide-y border rounded-xl bg-white">
          {versions.map((v) => (
            <div key={v.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold break-words">{v.label}</div>
                  <div className="text-xs text-gray-400">{new Date(v.createdAt).toLocaleString("ko-KR")}{v.final != null && ` · ${fmt(v.final)}원`}</div>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <button onClick={() => openCompare(v.id)} className="underline text-gray-600">{compareId === v.id ? "비교 닫기" : "현재와 비교"}</button>
                  <button disabled={busy} onClick={() => restore(v)} className="underline text-[#1f6f54]">이 상태로 복원</button>
                  <button onClick={() => remove(v)} className="underline text-red-600">삭제</button>
                </div>
              </div>
              {compareId === v.id && diff && base && current && (
                <div className="px-4 pb-4 text-xs space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="저장본 금액" value={`${fmt(base.totals.final)}원`} />
                    <Stat label="현재 금액" value={`${fmt(current.totals.final)}원`} />
                    <Stat label="차이" value={`${current.totals.final - base.totals.final >= 0 ? "+" : ""}${fmt(current.totals.final - base.totals.final)}원`} accent />
                  </div>
                  <p className="text-gray-500">변경 {diff.summary.changed} · 추가 {diff.summary.added} · 삭제 {diff.summary.removed} · 동일 {diff.summary.same}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="text-gray-400 text-left"><th className="py-1 pr-2">구분</th><th className="pr-2">공종</th><th className="pr-2">품명 / 규격</th><th className="pr-2 text-right">저장본 수량</th><th className="pr-2 text-right">현재 수량</th><th className="text-right">단가 변화</th></tr></thead>
                      <tbody>
                        {diff.rows.filter((r) => r.status !== "same").map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1.5 pr-2"><span className={`rounded-full px-1.5 py-0.5 ${color(r.status)}`}>{label2(r.status)}</span></td>
                            <td className="pr-2 whitespace-nowrap">{r.group}</td>
                            <td className="pr-2">{r.name} <span className="text-gray-400">{r.spec}</span></td>
                            <td className="pr-2 text-right">{r.qtyA}</td><td className="pr-2 text-right">{r.qtyB}</td>
                            <td className="text-right">{r.priceA !== r.priceB && r.qtyA > 0 && r.qtyB > 0 ? `${fmt(r.priceA)} → ${fmt(r.priceB)}` : "-"}</td>
                          </tr>
                        ))}
                        {diff.rows.every((r) => r.status === "same") && <tr><td colSpan={6} className="py-3 text-center text-gray-400">물량 변경 없음</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 ${accent ? "bg-black text-white" : "bg-gray-100"}`}>
      <div className={`text-[10px] ${accent ? "text-gray-300" : "text-gray-500"}`}>{label}</div>
      <div className="font-bold mt-0.5">{value}</div>
    </div>
  );
}
