"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/app/home", label: "홈", icon: "🏠" },
  { href: "/app/estimate", label: "견적서", icon: "📄" },
  { href: "/app/prices", label: "물가정보", icon: "💰" },
  { href: "/app/pumsem", label: "표준품셈", icon: "📐" },
  { href: "/app/settings", label: "설정", icon: "⚙️" },
];

export default function AppShell({
  children,
  userName,
  isAdmin,
}: {
  children: React.ReactNode;
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      {/* 데스크톱 사이드바 */}
      <nav className="hidden md:flex md:flex-col md:w-56 md:shrink-0 border-r bg-white min-h-screen sticky top-0 self-start py-6 px-3">
        <div className="px-2 mb-6">
          <div className="font-extrabold text-lg">⚡ 적산기</div>
          <div className="text-xs text-gray-400 mt-0.5">{userName}님</div>
        </div>
        <div className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  active ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.icon} {item.label}
              </Link>
            );
          })}
        </div>
        <div className="mt-auto flex flex-col gap-1 pt-6 border-t">
          <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100">내 정보</Link>
          {isAdmin && (
            <Link href="/admin" className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100">관리자</Link>
          )}
          <button onClick={logout} className="text-left rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100">
            로그아웃
          </button>
        </div>
      </nav>

      {/* 본문 */}
      <main className="flex-1 min-w-0 px-4 py-6 pb-24 md:pb-10 md:px-8 max-w-3xl mx-auto md:mx-0 w-full">
        {children}
      </main>

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t flex justify-between px-1 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom,0px))]">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 text-center text-[11px] font-semibold py-1.5 rounded-lg ${
                active ? "text-black bg-gray-100" : "text-gray-400"
              }`}
            >
              <div className="text-base leading-none mb-0.5">{item.icon}</div>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
