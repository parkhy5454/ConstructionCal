import Link from "next/link";

export const metadata = { title: "개인정보처리방침 | ConCal" };

// ⚠️ 템플릿입니다. [대괄호] 항목을 실제 정보로 바꾸고, 서비스 개시 전 반드시 법률 전문가의 검토를 받으세요.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-gray-800">
      <Link href="/" className="text-xs text-gray-400 underline">← 처음으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">개인정보처리방침</h1>
      <p className="text-xs text-gray-400 mb-6">시행일: [YYYY-MM-DD] · 개인정보 보호책임자: [성명/연락처]</p>

      <h2 className="font-bold mt-6 mb-1">1. 수집하는 개인정보</h2>
      <p>회원가입 및 서비스 이용 과정에서 아래 정보를 수집합니다.</p>
      <ul className="list-disc pl-5 mt-1 space-y-0.5">
        <li>필수: 이름, 이메일, 비밀번호(복호화할 수 없는 해시로만 저장)</li>
        <li>선택: 추천인 코드</li>
        <li>2단계 인증 사용 시: 인증 비밀키(암호화 저장), 복구 코드(해시 저장)</li>
        <li>서비스 이용 중 이용자가 입력·업로드한 견적서, 단가, 도면 등 자료</li>
        <li>자동 수집: 접속 IP(로그인 시도 횟수 제한 등 보안 목적), 쿠키(로그인 세션 유지)</li>
        <li>로그인 기록: 로그인 시각, 접속 IP, 브라우저·기기 종류 (계정 도용·공유 방지 및 &quot;새 환경 로그인&quot; 알림 목적, <b>90일 후 자동 삭제</b>)</li>
        <li>문의하기 이용 시: 이름, 이메일, 문의 내용</li>
      </ul>

      <h2 className="font-bold mt-6 mb-1">2. 이용 목적</h2>
      <p>회원 식별 및 가입 승인, 서비스 제공, 계정 보안(로그인 제한·2단계 인증), 이메일 인증·안내 발송, 문의 대응, 서비스 개선.</p>

      <h2 className="font-bold mt-6 mb-1">3. 보유 및 이용 기간</h2>
      <p>회원 탈퇴 시(내 정보 화면에서 직접 탈퇴 가능) 견적서·단가·품셈·거래처·문의 등 계정에 연결된 정보를 즉시 삭제합니다. 관리자 처리 이력(승인·구독 연장 등 운영 기록)은 이용자 식별 정보를 제외하고 운영·분쟁 대응을 위해 보관할 수 있습니다. 다만 관련 법령에 따라 보존이 필요한 정보는 해당 기간 동안 보관합니다. [보유 기간 확정 필요]</p>

      <h2 className="font-bold mt-6 mb-1">4. 제3자 제공 및 처리 위탁</h2>
      <p>법령에 근거가 있는 경우를 제외하고 이용자 동의 없이 제3자에게 제공하지 않습니다. 서비스 운영을 위해 아래 업체에 처리를 위탁할 수 있습니다.</p>
      <ul className="list-disc pl-5 mt-1 space-y-0.5">
        <li>호스팅: Vercel Inc.</li>
        <li>데이터베이스: Neon, Inc.</li>
        <li>이메일 발송(사용 시): Resend</li>
        <li>[실제 사용하는 업체로 수정/추가, 국외 이전 여부·국가·시기·방법 명시 필요]</li>
      </ul>

      <h2 className="font-bold mt-6 mb-1">5. 이용자의 권리</h2>
      <p>이용자는 언제든지 개인정보 열람·정정·삭제·처리정지를 요청할 수 있으며, 내 정보 화면에서 내 데이터를 파일로 내려받거나 직접 탈퇴할 수 있고, 내 정보 화면 또는 아래 연락처로 요청할 수 있습니다.</p>

      <h2 className="font-bold mt-6 mb-1">6. 안전성 확보 조치</h2>
      <p>비밀번호 해시 저장, 전송 구간 암호화(HTTPS), 로그인 시도 제한, 2단계 인증 지원, 접근 권한 통제 등 기술적·관리적 보호조치를 적용합니다.</p>

      <h2 className="font-bold mt-6 mb-1">7. 문의</h2>
      <p>개인정보 관련 문의: [이메일/연락처]</p>

      <p className="text-xs text-gray-400 mt-10">※ 이 문서는 기본 템플릿이며 법률 검토를 거친 문서가 아닙니다.</p>
    </main>
  );
}
