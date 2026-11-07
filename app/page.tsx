import Link from "next/link";
import { getServerUser } from "@/lib/serverUser";

export default async function Home() {
  const user = await getServerUser();
  return (
    <main className="mx-auto max-w-sm px-4 py-20 text-center">
      <h1 className="text-2xl font-bold mb-2">🏗️ ConCal — 공사 적산기</h1>
      <p className="text-sm text-gray-500 mb-8">전기·통신·소방·기계·토목·건축 — 자재단가DB × 표준품셈DB 자동 결합</p>
      {user ? (
        <div className="flex flex-col gap-2 items-center">
          <Link href="/app/home" className="inline-block bg-black text-white rounded-lg px-5 py-2 font-semibold w-40">
            적산기 열기
          </Link>
          <Link href="/dashboard" className="inline-block border rounded-lg px-5 py-2 font-semibold w-40">
            내 정보
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2 items-center">
          <Link href="/login" className="inline-block bg-black text-white rounded-lg px-5 py-2 font-semibold w-40">로그인</Link>
          <Link href="/signup" className="inline-block border rounded-lg px-5 py-2 font-semibold w-40">회원가입</Link>
        </div>
      )}
      <p className="mt-8 text-xs text-gray-400 text-center">
        <Link href="/pricing" className="underline">요금 안내</Link> · <Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보처리방침</Link>
      </p>
    </main>
  );
}
