"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ComputeResult, Material, LaborRate, RateSettings } from "@/lib/calc";
import {
  PRINT_CSS, buildPrintDocs, Sheet1Quantity, Sheet2Prices, Sheet3Ilwi, Sheet4IlwiList, Sheet5Detail, Sheet6Summary, Sheet7Estimate,
  type Supplier, type Recipient,
} from "@/components/PrintSheets";

type Project = { id: number; name: string; discipline: string };


// 제출용 인쇄 페이지: 브라우저의 "인쇄 → PDF로 저장"으로 A4 PDF를 만듭니다. (서버 PDF 생성이 아니라 브라우저 인쇄 기능을 사용)
export default function PrintPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<{ materials: Material[]; laborRates: LaborRate[]; rates: RateSettings } | null>(null);
  const [supplier, setSupplier] = useState<Supplier>({ company: "", regNo: "", address: "", bizType: "", bizItem: "", tel: "", fax: "", manager: "", mobile: "", email: "" });
  const [recipient, setRecipient] = useState<Recipient>({ client: "", dept: "", contact: "", email: "", date: new Date().toLocaleDateString("sv-SE") });
  const [on, setOn] = useState<boolean[]>([true, true, true, true, true, true, true]);
  const [logo, setLogo] = useState<string | null>(null);
  const [seal, setSeal] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const loaded = useRef(false);

  // 제출자 정보(상호·로고·직인)는 이 브라우저에만 저장해 다음 견적서에서도 재사용합니다(서버 저장 아님).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("concal_print_profile");
      if (raw) {
        const v = JSON.parse(raw);
        if (v.supplier && typeof v.supplier === "object") setSupplier((p) => ({ ...p, ...v.supplier }));
        else if (typeof v.company === "string") setSupplier((p) => ({ ...p, company: v.company }));
        if (typeof v.logo === "string") setLogo(v.logo);
        if (typeof v.seal === "string") setSeal(v.seal);
      }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem("concal_print_profile", JSON.stringify({ supplier, logo, seal }));
    } catch {}
  }, [supplier, logo, seal]);

  function pickImage(setter: (v: string | null) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { alert("PNG 또는 JPG 이미지만 가능합니다."); return; }
      if (f.size > 500 * 1024) { alert("이미지는 500KB 이하로 올려주세요."); return; }
      const r = new FileReader();
      r.onload = () => setter(typeof r.result === "string" ? r.result : null);
      r.readAsDataURL(f);
    };
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/projects/${params.id}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "불러오기 실패"); return; }
      setProject(data.project);
      setResult(data.result);
      setExtra({ materials: data.materials, laborRates: data.laborRates, rates: data.rates });
      const cid = data.meta?.clientId;
      const c = (data.clients ?? []).find((x: { id: number; name: string }) => x.id === cid);
      if (c) setRecipient((p) => ({ ...p, client: c.name }));
    })();
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!project || !result || !extra) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const docs = buildPrintDocs({ result, materials: extra.materials, laborRates: extra.laborRates, rates: extra.rates });
  const NAMES = ["1. 수량집계표", "2. 단가대비표", "3. 일위대가표", "4. 일위대가표 목록", "5. 공사예산내역서", "6. 집계표", "7. 견적서(갑지)"];
  const setS = (k: keyof Supplier) => (e: React.ChangeEvent<HTMLInputElement>) => setSupplier((p) => ({ ...p, [k]: e.target.value }));
  const setR = (k: keyof Recipient) => (e: React.ChangeEvent<HTMLInputElement>) => setRecipient((p) => ({ ...p, [k]: e.target.value }));
  const inp = "border rounded-lg px-3 py-2 text-sm";

  return (
    <div>
      <style>{PRINT_CSS}</style>

      <div className="no-print mb-4 bg-white border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/app/estimate/${project.id}`} className="text-xs text-gray-400 underline">← 견적서로</Link>
          <button onClick={() => window.print()} className="text-xs bg-black text-white rounded-lg px-3 py-1.5 font-semibold">
            🖨 인쇄 / PDF로 저장
          </button>
        </div>
        <p className="text-xs text-gray-400">
          인쇄 창에서 대상을 &quot;PDF로 저장&quot;으로 고르세요. 1~6번은 A4 가로, 7번 견적서(갑지)는 A4 세로이며 여백은 사방 같게 맞춰집니다.
          인쇄 창의 &quot;여백&quot;은 <b>기본값</b>, &quot;배율&quot;은 <b>100%</b>, &quot;머리글 및 바닥글&quot;은 <b>끄기</b>로 두세요. 크롬/엣지를 권장합니다.
        </p>

        <div className="text-xs">
          <div className="font-semibold text-gray-600 mb-1">인쇄할 문서 (순서대로 출력)</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600">
            {NAMES.map((n, i) => (
              <label key={n} className="flex items-center gap-1.5"><input type="checkbox" checked={on[i]} onChange={(e) => setOn((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} /> {n}</label>
            ))}
          </div>
        </div>

        <details open className="text-xs">
          <summary className="cursor-pointer font-semibold text-gray-600">견적서(갑지) 정보 — 수신</summary>
          <div className="grid sm:grid-cols-3 gap-2 mt-2">
            <input value={recipient.client} onChange={setR("client")} placeholder="제출처 (예: OO구청장)" className={inp} />
            <input value={recipient.dept} onChange={setR("dept")} placeholder="수신 (예: 문화체육과)" className={inp} />
            <input value={recipient.contact} onChange={setR("contact")} placeholder="수신처 연락처" className={inp} />
            <input value={recipient.email} onChange={setR("email")} placeholder="수신처 E-mail" className={inp} />
            <input value={recipient.date} onChange={setR("date")} placeholder="발행일자 (예: 2026-11-10)" className={inp} />
          </div>
        </details>
        <details open className="text-xs">
          <summary className="cursor-pointer font-semibold text-gray-600">공급자 정보 (이 브라우저에 저장되어 다음 견적서에도 쓰입니다)</summary>
          <div className="grid sm:grid-cols-3 gap-2 mt-2">
            <input value={supplier.company} onChange={setS("company")} placeholder="상호" className={inp} />
            <input value={supplier.regNo} onChange={setS("regNo")} placeholder="등록번호" className={inp} />
            <input value={supplier.address} onChange={setS("address")} placeholder="주소" className={inp} />
            <input value={supplier.bizType} onChange={setS("bizType")} placeholder="업태" className={inp} />
            <input value={supplier.bizItem} onChange={setS("bizItem")} placeholder="종목" className={inp} />
            <input value={supplier.tel} onChange={setS("tel")} placeholder="전화번호" className={inp} />
            <input value={supplier.fax} onChange={setS("fax")} placeholder="팩스" className={inp} />
            <input value={supplier.manager} onChange={setS("manager")} placeholder="담당자" className={inp} />
            <input value={supplier.mobile} onChange={setS("mobile")} placeholder="휴대폰" className={inp} />
            <input value={supplier.email} onChange={setS("email")} placeholder="이메일" className={inp} />
          </div>
          <div className="grid sm:grid-cols-2 gap-2 text-gray-600 mt-2">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0">로고</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickImage(setLogo)} className="text-xs" />
              {logo && <button type="button" onClick={() => setLogo(null)} className="underline text-gray-400">제거</button>}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0">직인</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickImage(setSeal)} className="text-xs" />
              {seal && <button type="button" onClick={() => setSeal(null)} className="underline text-gray-400">제거</button>}
            </div>
          </div>
        </details>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000}
          placeholder="비고 (예: 견적 유효기간 30일, 결제 조건 등) — 견적서(갑지) 하단에 인쇄됩니다"
          className="w-full border rounded-lg px-3 py-2 text-sm" />
        <p className="text-[11px] text-gray-400">공급자 정보·로고·직인은 이 브라우저에만 저장되며 서버로 전송되지 않습니다. 도장 이미지는 배경이 투명한 PNG가 가장 깔끔합니다. 단가대비표의 물가정보 Page와 조사단가(A·B사) 칸은 비워 두며, 인쇄 후 손으로 적거나 엑셀로 보완하세요.</p>
      </div>

      {on[0] && <Sheet1Quantity docs={docs} />}
      {on[1] && <Sheet2Prices docs={docs} />}
      {on[2] && <Sheet3Ilwi docs={docs} />}
      {on[3] && <Sheet4IlwiList docs={docs} />}
      {on[4] && <Sheet5Detail docs={docs} />}
      {on[5] && <Sheet6Summary result={result} />}
      {on[6] && <Sheet7Estimate result={result} supplier={supplier} recipient={recipient} logo={logo} seal={seal} notes={notes} />}
    </div>
  );
}
