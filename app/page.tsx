import Link from "next/link";
import { getServerUser } from "@/lib/serverUser";
import { PRICE_MONTHLY, PRICE_YEARLY, won } from "@/lib/pricing";

const FEATURES = [
  ["📦", "자재단가 × 표준품셈 자동 결합", "자재 수량만 넣으면 노무비·공구손료·경비·이윤까지 한 번에 계산합니다."],
  ["🧾", "내역서·표지·집계표 출력", "제출용 견적서를 바로 인쇄하거나 PDF로 저장합니다. 엑셀 내보내기도 지원합니다."],
  ["🔗", "읽기 전용 공유 링크", "거래처에 로그인 없이 볼 수 있는 링크를 보내고, 기간이 지나면 자동으로 닫힙니다."],
  ["🕘", "버전 기록·되돌리기", "수정 전 상태를 저장하고 비교해, 실수해도 이전 견적으로 돌아갈 수 있습니다."],
  ["📊", "수주 현황 관리", "작성 중·제출·수주·실주 상태와 거래처별 견적을 한눈에 봅니다."],
  ["⚠️", "검토 알림", "단가 0원, 삭제된 자재, 비정상적으로 큰 수량 같은 실수 가능성을 알려 줍니다."],
];

const STEPS = [
  ["1", "가입", "회원가입 후 관리자 승인이 나면 바로 시작합니다."],
  ["2", "물량 입력", "자재를 검색해 수량을 넣거나, 엑셀·도면에서 가져옵니다."],
  ["3", "견적서 출력", "금액 확인 후 인쇄하거나 링크로 공유합니다."],
];

const FAQ = [
  ["무료로 써 볼 수 있나요?", "체험 기간을 제공할 예정이며, 체험 중에도 모든 기능을 사용할 수 있습니다."],
  ["기본 단가·품셈은 그대로 쓰면 되나요?", "내장된 값은 사용 예시입니다. 실제 견적에는 본인이 확인한 단가와 최신 품셈 기준으로 수정해 사용하세요. 단가 기준월도 견적서에 적을 수 있습니다."],
  ["한 계정을 여러 명이 함께 쓸 수 있나요?", "한 계정은 1인용이며 동시에 한 기기에서만 로그인됩니다. 사용자별로 계정을 만들어 주세요."],
  ["구독을 끝내면 데이터는요?", "만료 후에는 읽기 전용으로 열람·내려받기가 가능하고, 내 정보 화면에서 언제든 데이터를 내려받거나 탈퇴할 수 있습니다."],
];

export default async function Home() {
  const user = await getServerUser();
  return (
    <main className="mx-auto max-w-3xl px-4 py-14">
      <section className="text-center">
        <h1 className="text-3xl font-bold mb-3">🏗️ ConCal — 공사 적산기</h1>
        <p className="text-gray-600 mb-2">전기·통신·소방·기계·토목·건축 견적을 빠르고 정확하게.</p>
        <p className="text-sm text-gray-400 mb-8">자재단가DB × 표준품셈DB 자동 결합 · 월 {won(PRICE_MONTHLY)}원부터 (부가세 별도)</p>
        {user ? (
          <div className="flex gap-2 justify-center">
            <Link href="/app/home" className="bg-black text-white rounded-lg px-6 py-2.5 font-semibold">적산기 열기</Link>
            <Link href="/dashboard" className="border rounded-lg px-6 py-2.5 font-semibold">내 정보</Link>
          </div>
        ) : (
          <div className="flex gap-2 justify-center">
            <Link href="/signup" className="bg-black text-white rounded-lg px-6 py-2.5 font-semibold">회원가입</Link>
            <Link href="/login" className="border rounded-lg px-6 py-2.5 font-semibold">로그인</Link>
          </div>
        )}
      </section>

      <section className="mt-14 grid sm:grid-cols-2 gap-3">
        {FEATURES.map(([icon, title, desc]) => (
          <div key={title} className="border rounded-xl p-4">
            <div className="text-xl mb-1">{icon}</div>
            <h2 className="font-semibold text-sm mb-1">{title}</h2>
            <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
          </div>
        ))}
      </section>

      <section className="mt-14">
        <h2 className="text-lg font-bold mb-4 text-center">이렇게 사용합니다</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="border rounded-xl p-4 text-center">
              <div className="mx-auto mb-2 w-7 h-7 rounded-full bg-[#1f6f54] text-white text-sm font-bold flex items-center justify-center">{n}</div>
              <div className="font-semibold text-sm">{t}</div>
              <p className="text-xs text-gray-500 mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 border rounded-xl p-5 text-center">
        <h2 className="text-lg font-bold mb-1">요금</h2>
        <p className="text-sm text-gray-600">월 {won(PRICE_MONTHLY)}원 · 연 {won(PRICE_YEARLY)}원 <span className="text-gray-400">(1인, 부가세 별도)</span></p>
        <Link href="/pricing" className="inline-block mt-3 text-sm underline">요금 자세히 보기</Link>
      </section>

      <section className="mt-14">
        <h2 className="text-lg font-bold mb-4 text-center">자주 묻는 질문</h2>
        <div className="space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="border rounded-xl px-4 py-3">
              <summary className="text-sm font-semibold cursor-pointer">{q}</summary>
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mt-12 text-xs text-gray-400 text-center">
        <Link href="/pricing" className="underline">요금 안내</Link> · <Link href="/contact" className="underline">문의하기</Link> · <Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보처리방침</Link>
      </p>
    </main>
  );
}
