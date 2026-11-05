import Link from "next/link";
import { getServerUser } from "@/lib/serverUser";

export default async function Home() {
  const user = await getServerUser();
  return (
    <main className="mx-auto max-w-sm px-4 py-20 text-center">
      <h1 className="text-2xl font-bold mb-2">⚡ 전기공사 적산기</h1>
      <p className="text-sm text-gray-500 mb-8">자재단가DB × 표준품셈DB 자동 결합</p>
      {user ? (
        <Link href="/dashboard" className="inline-block bg-black text-white rounded-lg px-5 py-2 font-semibold">
          대시보드로 이동
        </Link>
      ) : (
        <div className="flex flex-col gap-2 items-center">
          <Link href="/login" className="inline-block bg-black text-white rounded-lg px-5 py-2 font-semibold w-40">로그인</Link>
          <Link href="/signup" className="inline-block border rounded-lg px-5 py-2 font-semibold w-40">회원가입</Link>
        </div>
      )}
    </main>
  );
}
