import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/currentUser";
import { subscriptionBlock } from "@/lib/subscription";
import { getDb } from "@/lib/db";
import { DISCIPLINES, type Discipline } from "@/lib/calc";
import { parseDelimited, rowsFromTable, planImport, applyImport, loadExisting } from "@/lib/materialImport";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024; // 서버리스 요청 본문 한도 안쪽. 더 큰 표는 여러 파일로 나눠 올리거나 scripts/load-materials.ts를 사용하세요.

// 자재 단가 일괄 등록: 표(.tsv/.csv/.xlsx)를 올리면 mode=preview는 추가/변경 건수만 알려주고, mode=apply는 반영합니다.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const d = String(form?.get("discipline") ?? "");
  const mode = form?.get("mode") === "apply" ? "apply" : "preview";
  if (!(DISCIPLINES as readonly string[]).includes(d)) return NextResponse.json({ error: "업종이 올바르지 않습니다." }, { status: 400 });
  if (!file || typeof file === "string") return NextResponse.json({ error: "파일을 첨부하세요." }, { status: 400 });
  const f = file as File;
  if (f.size > MAX_BYTES) return NextResponse.json({ error: "파일이 너무 큽니다(4MB 이하). 여러 파일로 나눠 올려주세요." }, { status: 400 });

  const name = (f.name || "").toLowerCase();
  let table: string[][];
  try {
    if (name.endsWith(".xlsx")) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      const ws = wb.worksheets[0];
      table = [];
      ws?.eachRow({ includeEmpty: false }, (row) => {
        const vals: string[] = [];
        row.eachCell({ includeEmpty: true }, (c, i) => { const v = c.value; vals[i - 1] = v && typeof v === "object" && "result" in v ? String((v as { result: unknown }).result ?? "") : v == null ? "" : String(typeof v === "object" && "text" in (v as object) ? (v as { text: string }).text : v); });
        table.push(vals);
      });
    } else if (name.endsWith(".tsv") || name.endsWith(".csv") || name.endsWith(".txt")) {
      table = parseDelimited(await f.text());
    } else {
      return NextResponse.json({ error: ".xlsx, .csv, .tsv 파일만 지원합니다." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "파일을 읽지 못했습니다. 손상되었거나 형식이 맞지 않을 수 있습니다." }, { status: 400 });
  }

  const parsed = rowsFromTable(table);
  if (parsed.rows.length === 0) return NextResponse.json({ error: "등록할 행이 없습니다. 품명·단위·단가 열이 있는지 확인하세요.", warnings: parsed.warnings }, { status: 400 });
  if (parsed.rows.length > 60000) return NextResponse.json({ error: "한 번에 6만 행까지 가능합니다. 나눠서 올려주세요." }, { status: 400 });

  const db = getDb();
  const plan = planImport(parsed.rows, await loadExisting(db, user.id, d as Discipline));
  const summary = {
    total: parsed.rows.length, toAdd: plan.inserts.length, toUpdate: plan.updates.length, unchanged: plan.unchanged,
    duplicatesInFile: plan.duplicatesInFile, skipped: parsed.skipped, warnings: parsed.warnings,
    sample: plan.inserts.slice(0, 8).map((m) => ({ name: m.name, spec: m.spec, unit: m.unit, price: m.price })),
  };
  if (mode === "preview") return NextResponse.json({ summary });
  const out = await applyImport(db, user.id, d, plan);
  return NextResponse.json({ summary, ...out });
}
