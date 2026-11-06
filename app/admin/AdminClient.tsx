"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected";
  referralCode: string;
  referredBy: string | null;
  mustChangePassword: number;
  createdAt: string;
};

const statusLabel: Record<AdminUser["status"], string> = {
  pending: "승인대기",
  approved: "승인됨",
  rejected: "반려됨",
};
const statusColor: Record<AdminUser["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function AdminClient({ selfId }: { selfId: number }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (res.ok) setUsers(data.users);
    else setError(data.error ?? "불러오기 실패");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patchUser(id: number, body: Record<string, unknown>) {
    setBusyId(id); setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "처리 실패"); return; }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function resetPassword(id: number) {
    const pw = prompt("새 비밀번호를 입력하세요 (8자 이상, 영문+숫자). 사용자는 다음 로그인 시 반드시 변경해야 합니다.");
    if (!pw) return;
    patchUser(id, { newPassword: pw });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/home" className="text-xs text-gray-400 underline shrink-0">← 홈으로</Link>
      </div>
      <h1 className="text-xl font-bold mb-6">관리자 · 가입자 관리</h1>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">이름 / 이메일</th>
                <th className="text-left px-3 py-2">권한</th>
                <th className="text-left px-3 py-2">상태</th>
                <th className="text-left px-3 py-2">추천코드</th>
                <th className="text-left px-3 py-2">작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    {u.id === selfId ? (
                      <span className="text-gray-400">{u.role} (본인)</span>
                    ) : (
                      <select
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => patchUser(u.id, { role: e.target.value })}
                        className="border rounded px-2 py-1"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor[u.status]}`}>{statusLabel[u.status]}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{u.referralCode}</td>
                  <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                    {u.id !== selfId && u.status !== "approved" && (
                      <button disabled={busyId === u.id} onClick={() => patchUser(u.id, { status: "approved" })} className="text-green-700 underline text-xs">승인</button>
                    )}
                    {u.id !== selfId && u.status !== "rejected" && (
                      <button disabled={busyId === u.id} onClick={() => patchUser(u.id, { status: "rejected" })} className="text-red-700 underline text-xs">반려</button>
                    )}
                    <button disabled={busyId === u.id} onClick={() => resetPassword(u.id)} className="text-blue-700 underline text-xs">비밀번호 재설정</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-4">
        본인의 권한/승인상태는 다른 관리자만 바꿀 수 있습니다(실수로 잠기는 것 방지).
        비밀번호 재설정 시 해당 사용자는 다음 로그인 때 반드시 새 비밀번호로 바꿔야 합니다.
      </p>
    </main>
  );
}
