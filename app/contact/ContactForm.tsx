"use client";
import { useState } from "react";

export default function ContactForm({ initialName, initialEmail }: { initialName: string; initialEmail: string }) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, message }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "접수에 실패했습니다."); return; }
    setDone(true);
  }

  if (done) return <p className="border rounded-xl bg-white p-5 text-sm">문의가 접수되었습니다. 남겨 주신 이메일로 답변드리겠습니다.</p>;
  return (
    <form onSubmit={submit} className="space-y-2.5 text-sm">
      <input required value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="이름" className="w-full border rounded-lg px-3 py-2" />
      <input required type="email" value={email} maxLength={255} onChange={(e) => setEmail(e.target.value)} placeholder="답변받을 이메일" className="w-full border rounded-lg px-3 py-2" />
      <textarea required value={message} maxLength={3000} rows={6} onChange={(e) => setMessage(e.target.value)} placeholder="문의 내용 (오류 문의라면 어느 화면에서 무엇을 눌렀는지 적어 주세요)" className="w-full border rounded-lg px-3 py-2" />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button disabled={busy} className="bg-black text-white rounded-lg px-5 py-2 font-semibold disabled:opacity-50">{busy ? "보내는 중..." : "문의 보내기"}</button>
    </form>
  );
}
