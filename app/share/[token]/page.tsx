import { headers } from "next/headers";
import { resolveShare } from "@/lib/share";
import { computeProject } from "@/lib/projectCompute";
import { rateLimitAsync, clientIp } from "@/lib/rateLimit";
import { DOC_CSS, SummaryTable, CostTable, DetailTable, won } from "@/components/EstimateTables";
import { DISCIPLINE_LABELS } from "@/lib/calc";
import { reportError } from "@/lib/monitor";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "견적서", robots: { index: false, follow: false } };

function Gone({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-sm px-4 py-24 text-center">
      <h1 className="text-lg font-bold mb-2">견적서를 볼 수 없습니다</h1>
      <p className="text-sm text-gray-500">{message}</p>
    </main>
  );
}

// 로그인 없이 보는 읽기 전용 견적서. 링크 토큰을 아는 사람만 접근하며, 만료·해지되면 열리지 않습니다.
export default async function SharePage({ params }: { params: { token: string } }) {
  const ip = clientIp(new Request("http://x", { headers: headers() }));
  if (!(await rateLimitAsync(`share-view:${ip}`, 60, 10 * 60_000))) {
    return <Gone message="요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." />;
  }
  let r: Awaited<ReturnType<typeof resolveShare>>;
  let result: Awaited<ReturnType<typeof computeProject>>["result"];
  try {
    r = await resolveShare(params.token);
    if (!r) return <Gone message="링크가 만료되었거나 해지되었거나 올바르지 않습니다. 견적서를 보내 준 분께 새 링크를 요청해 주세요." />;
    ({ result } = await computeProject({ id: r.project.id, userId: r.project.userId, discipline: r.project.discipline, name: r.project.name }));
  } catch (e) {
    await reportError("share-page", e);
    return <Gone message="일시적인 오류로 견적서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." />;
  }
  const expires = r.link.expiresAt.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 text-black">
      <style>{DOC_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span>읽기 전용 견적서 · 링크 유효기간 {expires}까지</span>
        <PrintButton />
      </div>
      <div className="print-page bg-white border rounded-xl p-6 sm:p-8">
        <section className="page-break" style={{ textAlign: "center", paddingBottom: 24 }}>
          <div style={{ fontSize: 13, letterSpacing: 6, color: "#555" }}>{DISCIPLINE_LABELS[r.project.discipline as keyof typeof DISCIPLINE_LABELS] ?? ""} 공사</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "14px 0 22px" }}>견 적 서</h1>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{r.project.name}</div>
          <div style={{ marginTop: 16, fontSize: 14 }}>견적금액 (VAT 포함) <b>일금 {won(result.final)}원정</b></div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#777" }}>제출: {r.ownerName}</div>
        </section>
        <section className="page-break">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>총 괄 표</h2>
          <SummaryTable result={result} />
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 6px" }}>원 가 계 산 서</h2>
          <CostTable result={result} />
        </section>
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>내 역 서</h2>
          <div style={{ overflowX: "auto" }}><DetailTable result={result} /></div>
          <p style={{ fontSize: 10, color: "#777", marginTop: 8 }}>* 표준품셈(공수)이 없는 품목은 노무비 없이 재료비만 반영되었습니다.</p>
        </section>
      </div>
    </main>
  );
}
