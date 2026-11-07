import Link from "next/link";

export const metadata = { title: "이용약관 | ConCal" };

// ⚠️ 템플릿입니다. [대괄호] 항목을 실제 사업자 정보로 바꾸고, 서비스 개시 전 반드시 법률 전문가의 검토를 받으세요.
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-gray-800">
      <Link href="/" className="text-xs text-gray-400 underline">← 처음으로</Link>
      <h1 className="text-2xl font-bold mt-4 mb-2">이용약관</h1>
      <p className="text-xs text-gray-400 mb-6">시행일: [YYYY-MM-DD] · 운영자: [상호/성명]</p>

      <h2 className="font-bold mt-6 mb-1">제1조 (목적)</h2>
      <p>이 약관은 [상호](이하 &quot;운영자&quot;)가 제공하는 공사 적산 서비스 ConCal(이하 &quot;서비스&quot;)의 이용 조건과 운영자·이용자의 권리·의무를 정합니다.</p>

      <h2 className="font-bold mt-6 mb-1">제2조 (가입 및 승인)</h2>
      <p>이용자는 약관과 개인정보처리방침에 동의하고 가입을 신청합니다. 운영자는 가입 신청을 검토해 승인하거나 반려할 수 있으며, 승인 후에 서비스를 이용할 수 있습니다.</p>

      <h2 className="font-bold mt-6 mb-1">제3조 (계정 관리)</h2>
      <p>이용자는 계정과 비밀번호를 스스로 관리해야 하며, 제3자에게 양도·공유할 수 없습니다. 계정 도용이 의심되면 즉시 운영자에게 알려야 합니다.</p>

      <h2 className="font-bold mt-6 mb-1">제4조 (산출 결과에 대한 안내)</h2>
      <p>서비스가 제공하는 물량·단가·노무비·견적금액은 이용자가 입력하거나 등록한 자료와 설정한 요율, 서비스에 내장된 참고용 단가·품셈 데이터를 바탕으로 계산한 <b>참고용 결과</b>입니다. 실제 계약·입찰·제출에 사용하기 전에 이용자가 직접 검토·확인할 책임이 있으며, 운영자는 산출 결과의 정확성·완전성을 보증하지 않습니다. 도면(DXF) 자동 물량 산출과 엑셀 가져오기 결과도 이용자의 확인이 필요합니다.</p>

      <h2 className="font-bold mt-6 mb-1">제5조 (이용자 자료)</h2>
      <p>이용자가 입력·업로드한 자료(견적서, 단가, 도면 등)의 권리는 이용자에게 있으며, 운영자는 서비스 제공과 운영 목적 범위에서만 이용합니다. 이용자는 타인의 권리를 침해하는 자료를 올리지 않아야 합니다.</p>

      <h2 className="font-bold mt-6 mb-1">제6조 (금지행위)</h2>
      <p>서비스의 정상 운영을 방해하는 행위, 자동화된 수단을 이용한 과도한 접근, 보안 기능 우회, 타인 계정 이용, 서비스를 역설계하거나 무단 복제·재판매하는 행위를 금지합니다.</p>

      <h2 className="font-bold mt-6 mb-1">제7조 (서비스 변경 및 중단)</h2>
      <p>운영자는 운영상·기술상 필요에 따라 서비스를 변경하거나 일시 중단할 수 있으며, 가능한 경우 사전에 알립니다.</p>

      <h2 className="font-bold mt-6 mb-1">제8조 (이용 제한 및 해지)</h2>
      <p>운영자는 약관 위반 시 이용을 제한하거나 계정을 정지할 수 있습니다. 이용자는 언제든지 탈퇴를 요청할 수 있습니다.</p>

      <h2 className="font-bold mt-6 mb-1">제9조 (책임의 제한)</h2>
      <p>운영자는 천재지변, 외부 서비스 장애 등 불가항력으로 인한 손해와, 이용자의 귀책사유(입력 오류, 검토 누락 등)로 인한 손해에 대해 관련 법령이 허용하는 범위에서 책임을 지지 않습니다.</p>

      <h2 className="font-bold mt-6 mb-1">제10조 (문의 및 준거법)</h2>
      <p>문의: [이메일/연락처]. 이 약관은 대한민국 법령에 따르며, 분쟁은 관할 법원에서 해결합니다.</p>

      <p className="text-xs text-gray-400 mt-10">※ 이 문서는 기본 템플릿이며 법률 검토를 거친 문서가 아닙니다.</p>
    </main>
  );
}
