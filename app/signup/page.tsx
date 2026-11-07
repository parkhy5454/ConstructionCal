"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function SignupForm() {
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(params.get("ref") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, referralCode: referralCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "가입에 실패했습니다.");
        return;
      }
      setDone(data.message ?? "관리자 승인 후 로그인할 수 있습니다.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16 text-center">
        <h1 className="text-xl font-bold mb-3">가입 신청 완료</h1>
        <p className="text-sm text-gray-600">{done}</p>
        <Link href="/login" className="underline text-sm mt-4 inline-block">로그인 화면으로</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-bold mb-6">회원가입</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input required placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} className="border rounded-lg px-3 py-2" />
        <input type="email" required placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} className="border rounded-lg px-3 py-2" />
        <input type="password" required placeholder="비밀번호 (8자 이상, 영문+숫자)" value={password} onChange={(e) => setPassword(e.target.value)} className="border rounded-lg px-3 py-2" />
        <input placeholder="추천인 코드 (선택)" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())} className="border rounded-lg px-3 py-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="bg-black text-white rounded-lg py-2 font-semibold disabled:opacity-50">
          {loading ? "가입 신청 중..." : "가입 신청"}
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        이미 계정이 있나요? <Link href="/login" className="underline">로그인</Link>
      </p>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
