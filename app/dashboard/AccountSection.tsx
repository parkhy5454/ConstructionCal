"use client";
import { useEffect, useState } from "react";

type Login = { at: string; ip: string; agent: string };

export default function AccountSection() {
  const [logins, setLogins] = useState<Login[] | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/me/logins");
      const d = await res.json().catch(() => ({}));
      if (res.ok) setLogins(d.logins ?? []);
    })();
  }, []);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await fetch("/api/me/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, code }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "탈퇴 처리에 실패했습니다."); return; }
    window.location.href = "/";
  }

  return (
    <>
      <section className="border rounded-xl p-4 mt-4">
        <h2 className="font-semibold text-sm mb-1">최근 로그인 기록</h2>
        <p className="text-xs text-gray-400 mb-2">본인이 아닌 로그인이 보이면 바로 비밀번호를 변경하세요. (기록은 90일 보관)</p>
        {logins === null ? <p className="text-xs text-gray-400">불러오는 중...</p> : logins.length === 0 ? <p className="text-xs text-gray-400">기록이 없습니다.</p> : (
          <ul className="text-xs divide-y">
            {logins.map((l, i) => (
              <li key={i} className="py-1.5 flex flex-wrap justify-between gap-2">
                <span>{new Date(l.at).toLocaleString("ko-KR")}</span>
                <span className="text-gray-500">{l.agent} · {l.ip}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border rounded-xl p-4 mt-4">
        <h2 className="font-semibold text-sm mb-1">내 데이터</h2>
        <p className="text-xs text-gray-400 mb-3">견적서·자재 단가·품셈·거래처 등 내가 만든 데이터를 JSON 파일로 내려받을 수 있습니다. (구독이 끝난 뒤에도 가능)</p>
        <a href="/api/me/export" className="inline-block text-xs bg-black text-white rounded-lg px-3 py-1.5 font-semibold">⬇ 내 데이터 내려받기</a>
      </section>

      <section className="border border-red-200 rounded-xl p-4 mt-4">
        <h2 className="font-semibold text-sm text-red-700 mb-1">회원 탈퇴</h2>
        <p className="text-xs text-gray-500 mb-3">탈퇴하면 계정과 모든 견적서·단가·품셈 데이터가 <b>즉시 삭제되고 복구할 수 없습니다.</b> 필요하면 먼저 위에서 데이터를 내려받으세요.</p>
        {!open ? (
          <button onClick={() => setOpen(true)} className="text-xs text-red-600 underline">탈퇴 진행하기</button>
        ) : (
          <form onSubmit={remove} className="space-y-2 text-sm">
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="현재 비밀번호" className="w-full border rounded-lg px-3 py-2" />
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="2단계 인증 코드 (사용 중인 경우)" className="w-full border rounded-lg px-3 py-2" />
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="확인을 위해 '탈퇴'를 입력하세요" className="w-full border rounded-lg px-3 py-2" />
            {err && <p className="text-xs text-red-600">{err}</p>}
            <div className="flex gap-3 items-center">
              <button disabled={busy || confirmText.trim() !== "탈퇴" || !password} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
                {busy ? "처리 중..." : "계정과 모든 데이터 삭제"}
              </button>
              <button type="button" onClick={() => { setOpen(false); setErr(null); }} className="text-xs text-gray-500 underline">취소</button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
