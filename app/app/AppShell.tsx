"use client";
import { useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const current = NAV.find((item) => pathname?.startsWith(item.href));

  return (
    <div className="min-h-screen bg-[#f6f7f5] md:flex">
      {/* 데스크톱 사이드바 */}
      <nav className="hidden md:flex md:flex-col md:w-56 md:shrink-0 border-r border-[#e4e8e5] bg-white min-h-screen sticky top-0 self-start py-6 px-3">
        <div className="px-2 mb-6 flex items-center gap-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-gradient-to-b from-[#1f6f54] to-[#101814] text-white text-base shrink-0">🏗️</span>
          <div>
            <div className="font-extrabold text-[15px] leading-tight">ConCal</div>
            <div className="text-[11px] text-gray-400 leading-tight mt-0.5">{userName}님</div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  active ? "bg-[#e3efe8] text-[#1f6f54]" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.icon} {item.label}
              </Link>
            );
          })}
        </div>
        <div className="mt-auto flex flex-col gap-1 pt-6 border-t border-[#e4e8e5]">
          <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100">내 정보</Link>
          {isAdmin && (
            <Link href="/admin" className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100">관리자</Link>
          )}
          <button onClick={logout} className="text-left rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100">
            로그아웃
          </button>
        </div>
      </nav>

      {/* 모바일 상단바 */}
      <header className="md:hidden relative sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-[#e4e8e5] px-4 py-3 flex items-center gap-2 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <span className="grid place-items-center w-7 h-7 rounded-[8px] bg-gradient-to-b from-[#1f6f54] to-[#101814] text-white text-xs shrink-0">🏗️</span>
        <div className="font-extrabold text-[15px] flex-1">{current ? `${current.icon} ${current.label}` : "ConCal"}</div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="메뉴"
          className="grid place-items-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-600 shrink-0"
        >
          {userName.slice(0, 1)}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-4 top-[calc(100%+6px)] z-40 w-44 bg-white border border-[#e4e8e5] rounded-xl shadow-lg py-1.5 overflow-hidden">
              <div className="px-3 py-2 text-xs text-gray-400 border-b border-[#e4e8e5]">{userName}님</div>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">내 정보</Link>
              {isAdmin && (
                <Link href="/admin" onClick={() => setMenuOpen(false)} className="block px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">관리자</Link>
              )}
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-gray-50"
              >
                로그아웃
              </button>
            </div>
          </>
        )}
      </header>

      {/* 본문 */}
      <main className="flex-1 min-w-0 px-4 py-5 pb-24 md:py-6 md:pb-10 md:px-8 max-w-3xl mx-auto md:mx-0 w-full">
        {children}
      </main>

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-[#e4e8e5] flex justify-between px-1 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom,0px))] shadow-[0_-2px_10px_rgba(0,0,0,.06)]">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 text-center text-[11px] font-semibold py-1.5 rounded-lg transition-colors ${
                active ? "text-[#1f6f54] bg-[#e3efe8]" : "text-gray-400"
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
