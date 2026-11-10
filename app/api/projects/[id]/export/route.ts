import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getProjectOwned } from "@/lib/estimateData";
import { computeProject } from "@/lib/projectCompute";
import { buildPrintDocs } from "@/lib/printDocs";
import { buildDocsWorkbook, EMPTY_SUPPLIER, EMPTY_RECIPIENT, type Supplier, type Recipient } from "@/lib/excelDocs";

export const runtime = "nodejs";

// 선택값 ?p=JSON(공급자·수신·비고)을 안전하게 읽습니다: 알려진 키만, 문자열만, 길이 제한.
function pick<T extends Record<string, string>>(base: T, src: unknown, max = 200): T {
  const out = { ...base };
  if (src && typeof src === "object") {
    for (const k of Object.keys(base)) {
      const v = (src as Record<string, unknown>)[k];
      if (typeof v === "string") (out as Record<string, string>)[k] = v.slice(0, max);
    }
  }
  return out;
}

// 엑셀 다운: 제출용 문서 7종을 탭 7개(7. 갑지 … 1. 수량집계표)로 내려받습니다. 웹의 "저장" 화면과 같은 내용입니다.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const project = await getProjectOwned(user.id, id);
  if (!project) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  const { materials, laborRates, meta, result, rates } = await computeProject(project);

  let supplier: Supplier = EMPTY_SUPPLIER, recipient: Recipient = EMPTY_RECIPIENT, notes = "";
  const raw = req.nextUrl.searchParams.get("p");
  if (raw && raw.length <= 8000) {
    try {
      const p = JSON.parse(raw);
      supplier = pick(EMPTY_SUPPLIER, p.supplier);
      recipient = pick(EMPTY_RECIPIENT, p.recipient);
      if (typeof p.notes === "string") notes = p.notes.slice(0, 1000);
    } catch { /* 잘못된 값은 무시하고 빈 갑지로 내려줍니다 */ }
  }
  if (!recipient.date) recipient = { ...recipient, date: new Date().toLocaleDateString("sv-SE") };

  const docs = buildPrintDocs({ result, materials, laborRates, rates });
  const wb = buildDocsWorkbook({ docs, result, projectName: project.name, priceBasis: meta.priceBasis || undefined, supplier, recipient, notes });
  const buf = await wb.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${project.name}_공사예산내역서.xlsx`);
  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
