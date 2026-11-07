"use client";
import { useEffect, useState, useCallback } from "react";

type Link = { id: number; expiresAt: string; revokedAt: string | null; viewCount: number; lastViewedAt: string | null; createdAt: string };

export default function SharePanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [days, setDays] = useState(14);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/share`);
    const d = await res.json().catch(() => ({}));
    if (res.ok) setLinks(d.links ?? []);
  }, [projectId]);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function create() {
    setBusy(true); setMsg(null); setNewUrl(null);
    const res = await fetch(`/api/projects/${projectId}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error ?? "생성 실패"); return; }
    setNewUrl(d.url);
    load();
  }
  async function revoke(id: number) {
    if (!confirm("이 링크를 해지할까요? 이미 보낸 사람은 더 이상 열 수 없습니다.")) return;
    await fetch(`/api/projects/${projectId}/share`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ linkId: id }) });
    load();
  }
  async function copy() {
    if (!newUrl) return;
    try { await navigator.clipboard.writeText(newUrl); setMsg("복사했습니다."); } catch { setMsg("복사에 실패했습니다. 주소를 직접 선택해 복사하세요."); }
  }

  const state = (l: Link) => (l.revokedAt ? "해지됨" : new Date(l.expiresAt).getTime() <= Date.now() ? "만료" : "사용 중");

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="text-xs bg-white border rounded-lg px-3 py-1.5 font-semibold">🔗 공유 링크</button>
      {open && (
        <div className="mt-2 bg-white border rounded-xl p-4 space-y-3 text-xs">
          <p className="text-gray-500">로그인 없이 볼 수 있는 <b>읽기 전용</b> 링크입니다. 링크를 아는 사람은 누구나 열 수 있으니 필요한 사람에게만 보내고, 끝나면 해지하세요. (원본을 고치면 링크 내용도 최신으로 바뀝니다.)</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border rounded-lg px-2 py-1.5">
              {[1, 7, 14, 30, 90].map((d) => <option key={d} value={d}>{d}일 동안 유효</option>)}
            </select>
            <button disabled={busy} onClick={create} className="bg-black text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">새 링크 만들기</button>
          </div>
          {newUrl && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-2.5 space-y-1.5">
              <div className="text-green-800 font-semibold">링크가 만들어졌습니다. 이 주소는 지금만 보여드립니다.</div>
              <input readOnly value={newUrl} onFocus={(e) => e.currentTarget.select()} className="w-full border rounded px-2 py-1.5 bg-white font-mono" />
              <button onClick={copy} className="underline text-green-800">주소 복사</button>
            </div>
          )}
          {msg && <p className="text-gray-600">{msg}</p>}
          {links.length > 0 && (
            <table className="w-full">
              <thead><tr className="text-gray-400 text-left"><th className="py-1">만든 날</th><th>만료</th><th>상태</th><th className="text-right">조회</th><th></th></tr></thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1.5">{new Date(l.createdAt).toLocaleDateString("ko-KR")}</td>
                    <td>{new Date(l.expiresAt).toLocaleDateString("ko-KR")}</td>
                    <td className={state(l) === "사용 중" ? "text-green-700" : "text-gray-400"}>{state(l)}</td>
                    <td className="text-right">{l.viewCount}회</td>
                    <td className="text-right">{state(l) === "사용 중" && <button onClick={() => revoke(l.id)} className="text-red-600 underline">해지</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
