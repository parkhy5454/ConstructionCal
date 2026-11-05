"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type UserInfo = {
  name: string;
  email: string;
  role: "user" | "admin";
  referralCode: string;
  referredBy: string | null;
  mustChangePassword: boolean;
};

export default function DashboardClient({ initialUser }: { initialUser: UserInfo }) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null); setSaving(true);
    try {
      const body: Record<string, string> = { name, email };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "저장에 실패했습니다."); return; }
      setUser({ ...user, name, email, mustChangePassword: false });
      setCurrentPassword(""); setNewPassword("");
      setMsg("저장되었습니다.");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const referralLink = typeof window !== "undefined" ? `${window.location.origin}/signup?ref=${user.referralCode}` : "";

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">내 정보</h1>
        <button onClick={logout} className="text-sm underline text-gray-500">로그아웃</button>
      </div>

      {user.mustChangePassword && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-lg px-3 py-2 mb-4">
          관리자가 비밀번호를 재설정했습니다. 아래에서 새 비밀번호로 변경해주세요.
        </div>
      )}

      <section className="border rounded-xl p-4 mb-4">
        <h2 className="font-semibold mb-2 text-sm">추천인 코드</h2>
        <p className="text-sm text-gray-600">내 코드: <span className="font-mono font-bold">{user.referralCode}</span></p>
        {referralLink && <p className="text-xs text-gray-400 break-all mt-1">{referralLink}</p>}
        {user.referredBy && <p className="text-xs text-gray-400 mt-1">추천인: {user.referredBy}</p>}
      </section>

      <form onSubmit={saveProfile} className="flex flex-col gap-3 border rounded-xl p-4">
        <h2 className="font-semibold text-sm">정보 수정</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded-lg px-3 py-2" placeholder="이름" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border rounded-lg px-3 py-2" placeholder="이메일" />
        <hr className="my-1" />
        <p className="text-xs text-gray-500">비밀번호를 바꾸려면 아래 두 칸을 모두 입력하세요.</p>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="border rounded-lg px-3 py-2" placeholder="현재 비밀번호" />
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="border rounded-lg px-3 py-2" placeholder="새 비밀번호 (8자 이상, 영문+숫자)" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        <button disabled={saving} className="bg-black text-white rounded-lg py-2 font-semibold disabled:opacity-50">
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>

      {user.role === "admin" && (
        <a href="/admin" className="block text-center mt-4 text-sm underline">관리자 화면으로 이동</a>
      )}
    </main>
  );
}
