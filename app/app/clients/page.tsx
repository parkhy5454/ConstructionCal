"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Client = { id: number; name: string; contact: string | null; phone: string | null; email: string | null; address: string | null; memo: string | null };
const EMPTY = { name: "", contact: "", phone: "", email: "", address: "", memo: "" };

export default function ClientsPage() {
  const [list, setList] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/clients");
    const d = await res.json().catch(() => ({}));
    setList(d.clients ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch(editId ? `/api/clients/${editId}` : "/api/clients", {
      method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error ?? "저장 실패"); return; }
    setForm({ ...EMPTY }); setEditId(null); load();
  }
  function edit(c: Client) {
    setEditId(c.id);
    setForm({ name: c.name, contact: c.contact ?? "", phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "", memo: c.memo ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function remove(c: Client) {
    if (!confirm(`'${c.name}' 거래처를 삭제할까요? 이 거래처를 지정한 견적서는 거래처만 해제됩니다.`)) return;
    await fetch(`/api/clients/${c.id}`, { method: "DELETE" });
    load();
  }
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const shown = list.filter((c) => !q.trim() || `${c.name} ${c.contact ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/app/estimate" className="text-xs text-gray-400 underline">← 견적서 목록</Link>
        <h1 className="text-lg font-bold mt-1">🏢 거래처</h1>
        <p className="text-xs text-gray-400 mt-0.5">자주 거래하는 발주처를 저장해 두고 견적서에 지정하세요. 제출용 표지의 &lsquo;제출처&rsquo;에 자동으로 채워집니다.</p>
      </div>

      <form onSubmit={submit} className="bg-white border rounded-xl p-4 grid sm:grid-cols-2 gap-2 text-sm">
        <input required value={form.name} maxLength={120} onChange={set("name")} placeholder="거래처 이름 *" className="border rounded-lg px-3 py-2 sm:col-span-2" />
        <input value={form.contact} maxLength={80} onChange={set("contact")} placeholder="담당자" className="border rounded-lg px-3 py-2" />
        <input value={form.phone} maxLength={40} onChange={set("phone")} placeholder="연락처" className="border rounded-lg px-3 py-2" />
        <input type="email" value={form.email} maxLength={255} onChange={set("email")} placeholder="이메일" className="border rounded-lg px-3 py-2" />
        <input value={form.address} maxLength={255} onChange={set("address")} placeholder="주소" className="border rounded-lg px-3 py-2" />
        <textarea value={form.memo} maxLength={2000} rows={2} onChange={set("memo")} placeholder="메모" className="border rounded-lg px-3 py-2 sm:col-span-2" />
        <div className="sm:col-span-2 flex items-center gap-3">
          <button className="bg-black text-white rounded-lg px-4 py-2 font-semibold">{editId ? "수정 저장" : "거래처 추가"}</button>
          {editId && <button type="button" onClick={() => { setEditId(null); setForm({ ...EMPTY }); }} className="text-xs text-gray-500 underline">취소</button>}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      </form>

      {list.length > 5 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 검색" className="w-full border rounded-lg px-3 py-2 text-sm bg-white" />}
      {loading ? <p className="text-sm text-gray-400">불러오는 중...</p> : shown.length === 0 ? <p className="text-sm text-gray-400">등록된 거래처가 없습니다.</p> : (
        <div className="divide-y border rounded-xl bg-white">
          {shown.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 text-sm">
                <div className="font-semibold break-words">{c.name}</div>
                <div className="text-xs text-gray-500 break-words">{[c.contact, c.phone, c.email].filter(Boolean).join(" · ")}</div>
                {c.address && <div className="text-xs text-gray-400 break-words">{c.address}</div>}
                {c.memo && <div className="text-xs text-gray-400 mt-0.5 whitespace-pre-wrap break-words">{c.memo}</div>}
              </div>
              <div className="flex gap-3 text-xs shrink-0">
                <button onClick={() => edit(c)} className="underline text-gray-600">수정</button>
                <button onClick={() => remove(c)} className="underline text-red-600">삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
