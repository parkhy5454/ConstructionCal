"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
        return;
      }
      if (data.user?.mustChangePassword) {
        router.push("/dashboard?forceChangePassword=1");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
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
        <button disabled={loading} className="bg-black text-white rounded-lg py-2 font-semibold disabled:opacity-50">
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        계정이 없으신가요? <Link href="/signup" className="underline">회원가입</Link>
      </p>
    </main>
  );
}
