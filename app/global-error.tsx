"use client";
import { useEffect } from "react";
import { sendClientError } from "@/lib/clientErrorReport";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { sendClientError(error); }, [error]);
  return (
    <html lang="ko">
      <body style={{ fontFamily: "sans-serif", textAlign: "center", padding: "80px 16px" }}>
        <h1 style={{ fontSize: 18 }}>문제가 발생했습니다</h1>
        <p style={{ color: "#666", fontSize: 14 }}>잠시 후 다시 시도해 주세요.</p>
        <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, background: "#000", color: "#fff", border: 0 }}>다시 시도</button>
      </body>
    </html>
  );
}
