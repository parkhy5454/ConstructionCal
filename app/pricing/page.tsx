import Link from "next/link";
import { PRICE_MONTHLY, PRICE_YEARLY, won } from "@/lib/pricing";
import { trialDays } from "@/lib/subscription";

export const metadata = { title: "요금 안내 | ConCal" };
export const dynamic = "force-dynamic"; // TRIAL_DAYS 환경변수를 요청 시점에 반영

// ⚠️ [대괄호] 항목(입금 계좌, 연락처, 환불 규정)은 실제 정보로 바꾸세요.
export default function PricingPage() {
  const trial = trialDays();
  const saved = PRICE_MONTHLY * 12 - PRICE_YEARLY;
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-gray-800">
      <Link href="/" className="text-xs text-gray-400 underline">← 처음으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-1">요금 안내</h1>
      <p className="text-gray-500 mb-6">공사 적산·견적을 도면과 엑셀에서 바로 뽑아내는 ConCal. 모든 금액은 <b>부가세 별도</b>, <b>계정 1개(1인)</b> 기준입니다.</p>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="border rounded-2xl p-5 bg-white">
          <div className="text-xs font-semibold text-gray-400">월 구독</div>
          <div className="mt-2 text-3xl font-extrabold">{won(PRICE_MONTHLY)}<span className="text-base font-semibold text-gray-500">원 / 월</span></div>
          <div className="text-xs text-gray-400 mt-1">부가세 별도 · 언제든 해지</div>
        </div>
        <div className="border-2 border-[#1f6f54] rounded-2xl p-5 bg-white">
          <div className="text-xs font-semibold text-[#1f6f54]">연 구독 · 2개월 할인</div>
          <div className="mt-2 text-3xl font-extrabold">{won(PRICE_YEARLY)}<span className="text-base font-semibold text-gray-500">원 / 년</span></div>
          <div className="text-xs text-gray-400 mt-1">부가세 별도 · 월 구독 대비 {won(saved)}원 절약</div>
        </div>
      </div>
      {trial > 0 && <p className="text-xs text-[#1f6f54] font-semibold mb-6">가입 승인 후 {trial}일 무료 체험 — 카드 등록 없이 모든 기능을 써볼 수 있습니다.</p>}

      <h2 className="font-bold mt-8 mb-2">포함된 기능</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>DXF 도면 업로드 → 자재 물량 자동 산출 → 내역서·견적서 자동 계산</li>
        <li>기존 엑셀 내역서 업로드 → 우리 단가로 견적 자동 산출 (한 번 연결한 품목은 기억)</li>
        <li>전기·통신·소방 자재 단가와 표준품셈(노무비) 기본 제공 — 단가·품셈·요율은 직접 수정 가능</li>
        <li>기계·토목·건축은 단가를 직접 입력해 사용할 수 있습니다 (기본 DB는 준비 중)</li>
        <li>내역서·총괄표·원가계산서 엑셀 다운로드, 제출용 인쇄/PDF(표지·결재란·직인·비고·일위대가표)</li>
        <li>견적서 복제·검색, 2단계 인증 등 계정 보안</li>
      </ul>

      <h2 className="font-bold mt-8 mb-2">이용 방법</h2>
      <ol className="list-decimal pl-5 space-y-1">
        <li><Link href="/signup" className="underline">회원가입</Link> 후 관리자 승인을 받습니다.</li>
        <li>{trial > 0 ? `${trial}일 무료 체험으로 ` : ""}기능을 먼저 써봅니다.</li>
        <li>구독을 원하시면 아래 계좌로 입금하신 뒤 연락 주세요. 입금 확인 후 바로 이용 기간을 열어 드립니다. (세금계산서 발행 가능)</li>
      </ol>
      <div className="mt-3 border rounded-xl bg-white p-4 text-xs space-y-1">
        <div><b>입금 계좌:</b> [은행 / 계좌번호 / 예금주]</div>
        <div><b>문의:</b> [이메일 또는 전화번호]</div>
      </div>
      <p className="text-xs text-gray-400 mt-1">※ 자동 결제는 준비 중이며, 현재는 입금 확인 방식입니다.</p>

      <h2 className="font-bold mt-8 mb-2">자주 묻는 질문</h2>
      <dl className="space-y-3">
        <div><dt className="font-semibold">한 계정을 여러 명이 같이 써도 되나요?</dt><dd className="text-gray-600">아니요. 계정은 1인용이며 동시에 한 기기에서만 로그인됩니다. 여러 명이 쓰려면 인원 수만큼 계정이 필요합니다.</dd></div>
        <div><dt className="font-semibold">체험·구독이 끝나면 데이터는 어떻게 되나요?</dt><dd className="text-gray-600">데이터는 그대로 남고 읽기 전용이 됩니다. 조회·엑셀 다운로드·인쇄는 가능하고, 구독을 이어가면 바로 수정할 수 있습니다.</dd></div>
        <div><dt className="font-semibold">산출 결과를 그대로 제출해도 되나요?</dt><dd className="text-gray-600">참고용 계산 결과입니다. 제출 전에 물량과 단가를 직접 검토해 주세요. 자세한 내용은 <Link href="/terms" className="underline">이용약관</Link>을 확인하세요.</dd></div>
        <div><dt className="font-semibold">환불은 되나요?</dt><dd className="text-gray-600">[환불 규정 확정 필요: 예) 결제 후 7일 이내 미사용 시 전액 환불]</dd></div>
      </dl>

      <div className="mt-10 text-center">
        <Link href="/signup" className="inline-block bg-black text-white rounded-lg px-6 py-2.5 font-semibold">회원가입</Link>
      </div>
      <p className="mt-6 text-xs text-gray-400 text-center"><Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보처리방침</Link></p>
    </main>
  );
}
