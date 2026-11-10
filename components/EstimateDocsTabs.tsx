"use client";
// 견적서 화면의 "제출용 양식" 탭: 엑셀 양식과 같은 7종 문서를 화면에서 바로 확인합니다(인쇄·PDF 저장은 저장 화면).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ComputeResult, Material, LaborRate, RateSettings } from "@/lib/calc";
import {
  PRINT_CSS, buildPrintDocs, Sheet1Quantity, Sheet2Prices, Sheet3Ilwi, Sheet4IlwiList, Sheet5Detail, Sheet6Summary, Sheet7Estimate,
  type Supplier, type Recipient,
} from "@/components/PrintSheets";

const TABS = ["1. 수량집계표", "2. 단가대비표", "3. 일위대가표", "4. 일위대가표 목록", "5. 공사예산내역서", "6. 집계표", "7. 견적서(갑지)"];
const EMPTY_SUPPLIER: Supplier = { company: "", regNo: "", address: "", bizType: "", bizItem: "", tel: "", fax: "", manager: "", mobile: "", email: "" };

export default function EstimateDocsTabs({ projectId, projectName, result, materials, laborRates, rates, clientName }: {
  projectId: string; projectName: string; result: ComputeResult; materials: Material[]; laborRates: LaborRate[]; rates: RateSettings; clientName?: string;
}) {
  const [tab, setTab] = useState(0);
  const [supplier, setSupplier] = useState<Supplier>(EMPTY_SUPPLIER);
  const [logo, setLogo] = useState<string | null>(null);
  const [seal, setSeal] = useState<string | null>(null);

  // 공급자 정보는 저장 화면에서 입력해 이 브라우저에 저장해 둔 값을 읽기만 합니다.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("concal_print_profile");
      if (raw) {
        const v = JSON.parse(raw);
        if (v.supplier && typeof v.supplier === "object") setSupplier({ ...EMPTY_SUPPLIER, ...v.supplier });
        if (typeof v.logo === "string") setLogo(v.logo);
        if (typeof v.seal === "string") setSeal(v.seal);
      }
    } catch {}
  }, []);

  const docs = useMemo(() => buildPrintDocs({ result, materials, laborRates, rates }), [result, materials, laborRates, rates]);
  const recipient: Recipient = { client: clientName ?? "", dept: "", contact: "", email: "", date: new Date().toLocaleDateString("sv-SE") };

  return (
    <section className="bg-white border rounded-xl p-4" id="docs">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold">제출용 양식 <span className="text-gray-400 font-normal">— {projectName}</span></h2>
        <div className="flex items-center gap-3 text-xs">
          <Link href={`/app/estimate/${projectId}/print`} className="underline text-gray-600">🖨 인쇄·PDF 저장 / 공급자 정보 입력</Link>
        </div>
      </div>
      <div role="tablist" className="flex flex-wrap gap-1 mb-3">
        {TABS.map((t, i) => (
          <button key={t} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
            className={`text-xs rounded-lg px-3 py-1.5 border ${tab === i ? "bg-black text-white border-black font-semibold" : "bg-white text-gray-600"}`}>{t}</button>
        ))}
      </div>
      <div className="bg-gray-50 rounded-lg p-2 overflow-x-auto">
        {tab === 0 && <Sheet1Quantity docs={docs} />}
        {tab === 1 && <Sheet2Prices docs={docs} />}
        {tab === 2 && <Sheet3Ilwi docs={docs} />}
        {tab === 3 && <Sheet4IlwiList docs={docs} />}
        {tab === 4 && <Sheet5Detail docs={docs} />}
        {tab === 5 && <Sheet6Summary result={result} />}
        {tab === 6 && <Sheet7Estimate result={result} supplier={supplier} recipient={recipient} logo={logo} seal={seal} notes="" />}
      </div>
      {tab === 6 && !supplier.company && <p className="text-[11px] text-gray-400 mt-2">공급자 정보(상호·등록번호 등)는 &quot;인쇄·PDF 저장&quot; 화면에서 한 번 입력하면 이 브라우저에 저장되어 여기에도 표시됩니다.</p>}
    </section>
  );
}
