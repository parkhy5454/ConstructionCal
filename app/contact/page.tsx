import Link from "next/link";
import { getServerUser } from "@/lib/serverUser";
import ContactForm from "./ContactForm";

export const metadata = { title: "문의하기 | ConCal" };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const user = await getServerUser();
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <Link href="/" className="text-xs text-gray-400 underline">← 처음으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-1">문의하기</h1>
      <p className="text-sm text-gray-500 mb-6">사용 중 불편한 점, 오류, 요금·세금계산서 문의 등을 남겨 주세요. 남겨 주신 이메일로 답변드립니다.</p>
      <ContactForm initialName={user?.name ?? ""} initialEmail={user?.email ?? ""} />
      <p className="mt-8 text-xs text-gray-400 text-center">
        <Link href="/pricing" className="underline">요금 안내</Link> · <Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보처리방침</Link>
      </p>
    </main>
  );
}
