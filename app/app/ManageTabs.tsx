"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app/prices", label: "내 자재 단가" },
  { href: "/app/pumsem", label: "내 표준품셈" },
  { href: "/app/settings", label: "기본 설정" },
];

// "내 자재 관리"의 하위 화면을 바로 오가는 탭
export default function ManageTabs() {
  const path = usePathname();
  return (
    <div className="flex gap-1.5 border-b border-[#e4e8e5]">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} className={`px-3 py-2 text-sm font-semibold -mb-px border-b-2 ${on ? "border-[#1f6f54] text-[#1f6f54]" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
