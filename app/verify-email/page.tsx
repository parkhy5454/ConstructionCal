"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("인증 링크가 올바르지 않습니다.");
      return;
    }
    let cancelled = false;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setState("ok");
        else {
          setState("error");
          setMessage(d.error ?? "인증에 실패했습니다.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState("error");
          setMessage("네트워크 오류가 발생했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="mx-auto max-w-sm px-4 py-16 text-center">
      {state === "loading" && <p className="text-sm text-gray-500">이메일을 확인하는 중...</p>}
      {state === "ok" && (
        <>
          <h1 className="text-xl font-bold mb-3">이메일 인증 완료</h1>
          <p className="text-sm text-gray-600">이메일이 확인되었습니다. 관리자 승인이 끝났다면 바로 로그인할 수 있습니다.</p>
        </>
      )}
      {state === "error" && (
        <>
          <h1 className="text-xl font-bold mb-3">인증하지 못했습니다</h1>
          <p className="text-sm text-red-600">{message}</p>
        </>
      )}
      <Link href="/login" className="underline text-sm mt-6 inline-block">로그인 화면으로</Link>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
