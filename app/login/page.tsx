"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null); // 값이 있으면 2단계 인증(코드 입력) 단계
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [loading, setLoading] = useState(false);

  function finish(data: { user?: { mustChangePassword?: boolean } }) {
    router.push(data.user?.mustChangePassword ? "/dashboard?forceChangePassword=1" : "/app/home");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setNeedsVerify(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "로그인에 실패했습니다.");
        if (data.needsEmailVerification) setNeedsVerify(true);
        return;
      }
      if (data.needs2fa) {
        setChallenge(data.challenge);
        setPassword("");
        return;
      }
      finish(data);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "인증에 실패했습니다.");
        if (data.expired) {
          setChallenge(null);
          setCode("");
        }
        return;
      }
      finish(data);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    setError(null);
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (res.ok) {
      setNotice(data.message);
      setNeedsVerify(false);
    } else {
      setError(data.error ?? "재발송에 실패했습니다.");
    }
  }

  if (challenge) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-xl font-bold mb-2">2단계 인증</h1>
        <p className="text-sm text-gray-500 mb-6">
          인증 앱(Google Authenticator 등)에 표시된 6자리 코드를 입력하세요. 앱을 쓸 수 없으면 복구 코드(예: ABCDE-FGHJK) 하나를 입력할 수 있습니다.
        </p>
        <form onSubmit={onVerify2fa} className="flex flex-col gap-3">
          <input
            required autoFocus inputMode="text" autoComplete="one-time-code" placeholder="6자리 코드 또는 복구 코드"
            value={code} onChange={(e) => setCode(e.target.value)}
            className="border rounded-lg px-3 py-2 tracking-widest text-center"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="bg-black text-white rounded-lg py-2 font-semibold disabled:opacity-50">
            {loading ? "확인 중..." : "확인"}
          </button>
        </form>
        <button onClick={() => { setChallenge(null); setCode(""); setError(null); }} className="text-sm text-gray-500 underline mt-4">
          처음으로
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-bold mb-6">로그인</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email" required placeholder="이메일" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded-lg px-3 py-2"
        />
        <input
          type="password" required placeholder="비밀번호" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded-lg px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}
        {needsVerify && (
          <button type="button" onClick={resendVerification} className="text-sm underline text-left text-[#1f6f54]">
            인증 메일 다시 받기
          </button>
        )}
        <button disabled={loading} className="bg-black text-white rounded-lg py-2 font-semibold disabled:opacity-50">
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
      <p className="text-xs text-gray-400 mt-3">
        한 계정은 한 기기에서만 로그인할 수 있습니다. 다른 기기에서 로그인하면 기존 기기는 자동으로 로그아웃됩니다.
      </p>
      <p className="text-sm text-gray-500 mt-4">
        계정이 없으신가요? <Link href="/signup" className="underline">회원가입</Link>
      </p>
    </main>
  );
}
