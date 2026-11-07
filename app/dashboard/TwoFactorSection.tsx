"use client";
import { useEffect, useState } from "react";

type Setup = { secret: string; uri: string; qr: string };

// 내 정보 화면의 2단계 인증(TOTP) 설정/해제. 설정과 해제에는 현재 비밀번호가 필요합니다.
export default function TwoFactorSection({ isAdmin }: { isAdmin: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "disabling">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/me/2fa");
    if (!res.ok) return;
    const d = await res.json();
    setEnabled(!!d.enabled);
    setRemaining(d.recoveryCodesRemaining ?? 0);
  }
  useEffect(() => { refresh(); }, []);

  async function call(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "요청에 실패했습니다."); return null; }
      return d;
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startSetup(e: React.FormEvent) {
    e.preventDefault();
    const d = await call({ action: "setup", currentPassword: password });
    if (d) { setSetup(d); setPassword(""); setCode(""); }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    const d = await call({ action: "enable", code });
    if (d) { setRecovery(d.recoveryCodes); setSetup(null); setCode(""); refresh(); }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    const d = await call({ action: "disable", currentPassword: password, code });
    if (d) { setMode("idle"); setPassword(""); setCode(""); refresh(); }
  }

  if (enabled === null) return null;

  return (
    <section className="border rounded-xl p-4 mt-4">
      <h2 className="font-semibold text-sm mb-1">
        2단계 인증 <span className={`text-[10px] ml-1 rounded-full px-2 py-0.5 ${enabled ? "bg-[#e3efe8] text-[#1f6f54]" : "bg-gray-100 text-gray-500"}`}>{enabled ? "사용 중" : "꺼짐"}</span>
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        비밀번호가 유출돼도 계정을 지킬 수 있도록, 로그인할 때 인증 앱(Google Authenticator·Microsoft Authenticator 등)의 6자리 코드를 한 번 더 확인합니다.
        {isAdmin && " 관리자 계정은 반드시 켜두기를 권장합니다."}
      </p>

      {recovery && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-3">
          <p className="text-sm font-semibold text-amber-800 mb-1">복구 코드를 지금 저장하세요</p>
          <p className="text-xs text-amber-800 mb-2">휴대폰을 잃어버렸을 때 쓰는 1회용 코드입니다. <b>이 화면을 닫으면 다시 볼 수 없습니다.</b> 안전한 곳에 적어두세요.</p>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm">
            {recovery.map((c) => <span key={c}>{c}</span>)}
          </div>
          <button onClick={() => setRecovery(null)} className="mt-3 text-xs underline text-amber-800">저장했습니다 (닫기)</button>
        </div>
      )}

      {!enabled && !setup && (
        <form onSubmit={startSetup} className="flex flex-wrap gap-2 items-center">
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="현재 비밀번호" className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]" />
          <button disabled={busy} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">2단계 인증 켜기</button>
        </form>
      )}

      {!enabled && setup && (
        <form onSubmit={confirmEnable} className="space-y-3">
          <p className="text-xs text-gray-600">1. 인증 앱에서 QR 코드를 스캔하세요. (스캔이 안 되면 아래 키를 직접 입력)</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="2단계 인증 QR 코드" width={220} height={220} className="border rounded-lg" />
          <p className="text-xs text-gray-500 break-all">수동 입력 키: <span className="font-mono font-semibold">{setup.secret}</span></p>
          <p className="text-xs text-gray-600">2. 앱에 표시된 6자리 코드를 입력해 설정을 완료하세요.</p>
          <div className="flex gap-2">
            <input required inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6자리 코드" className="border rounded-lg px-3 py-2 text-sm w-32 tracking-widest text-center" />
            <button disabled={busy} className="bg-[#1f6f54] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">확인하고 켜기</button>
          </div>
        </form>
      )}

      {enabled && mode === "idle" && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">남은 복구 코드 {remaining}개</span>
          <button onClick={() => { setMode("disabling"); setError(null); }} className="text-xs underline text-red-600">끄기</button>
        </div>
      )}

      {enabled && mode === "disabling" && (
        <form onSubmit={disable} className="space-y-2">
          <p className="text-xs text-gray-600">끄려면 현재 비밀번호와 인증 앱 코드(또는 복구 코드)가 필요합니다.</p>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="현재 비밀번호" className="border rounded-lg px-3 py-2 text-sm w-full" />
          <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="6자리 코드 또는 복구 코드" className="border rounded-lg px-3 py-2 text-sm w-full" />
          <div className="flex gap-2">
            <button disabled={busy} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">2단계 인증 끄기</button>
            <button type="button" onClick={() => { setMode("idle"); setPassword(""); setCode(""); setError(null); }} className="text-sm underline text-gray-500">취소</button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </section>
  );
}
