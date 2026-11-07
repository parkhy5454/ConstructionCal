"use client";
import { useEffect } from "react";
import { sendClientError } from "@/lib/clientErrorReport";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { sendClientError(error); }, [error]);
  return (
    <main className="mx-auto max-w-sm px-4 py-20 text-center">
      <h1 className="text-lg font-bold mb-2">문제가 발생했습니다</h1>
      <p className="text-sm text-gray-500 mb-5">잠시 후 다시 시도해 주세요. 계속되면 운영자에게 알려주세요. (오류는 자동으로 운영자에게 전달되었습니다)</p>
      <button onClick={reset} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold">다시 시도</button>
    </main>
  );
}
