import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/serverUser";
import { getSubscriptionInfo } from "@/lib/subscription";
import Link from "next/link";
import AppShell from "./AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect("/login");
  const sub = await getSubscriptionInfo(user);
  const banner =
    sub.status === "trial"
      ? { cls: "bg-blue-50 text-blue-800 border-blue-200", text: `무료 체험 중 · ${sub.daysLeft}일 남았습니다.` }
      : sub.status === "paid" && (sub.daysLeft ?? 99) <= 7
      ? { cls: "bg-amber-50 text-amber-800 border-amber-200", text: `구독 만료까지 ${sub.daysLeft}일 남았습니다. 연장은 운영자에게 문의하세요.` }
      : sub.status === "expired"
      ? { cls: "bg-red-50 text-red-800 border-red-200", text: "무료 체험(구독)이 종료되어 읽기 전용입니다. 조회·엑셀 다운로드·인쇄는 가능하고 저장·수정은 막혀 있습니다. 이용 연장은 운영자에게 문의하세요." }
      : null;
  return (
    <AppShell userName={user.name} isAdmin={user.role === "admin"}>
      {banner && (
        <div className={`no-print mb-4 rounded-lg border px-3 py-2 text-xs ${banner.cls}`}>
          {banner.text} <Link href="/pricing" className="underline font-semibold">요금 안내</Link>
        </div>
      )}
      {children}
    </AppShell>
  );
}
