"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { DISCIPLINES, DISCIPLINE_LABELS } from "@/lib/calc";
import { parseDelimited, rowsFromTable } from "@/lib/materialImport";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected";
  referralCode: string;
  referredBy: string | null;
  mustChangePassword: number;
  createdAt: string;
  totpEnabled: boolean;
  emailVerified: boolean | null; // null = 이메일 인증 대상 아님
  subStatus: "off" | "admin" | "paid" | "trial" | "expired";
  subUntil: string | null;
  subDaysLeft: number | null;
  subStarted: boolean; // 체험/구독 행이 있는가(첫 이용 전이면 false)
  disciplines: string[] | null;
  lastLoginAt: string | null;
  ips7: number;
  ips30: number;
};
type Overview = {
  funnel: Record<string, number | boolean>;
  inquiries: Array<{ id: number; name: string; email: string; message: string; status: string; createdAt: string }>;
};

const statusLabel: Record<AdminUser["status"], string> = {
  pending: "승인대기",
  approved: "승인됨",
  rejected: "반려됨",
};
const statusColor: Record<AdminUser["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export default function AdminClient({ selfId }: { selfId: number }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [trialOn, setTrialOn] = useState(false);
  const [planOn, setPlanOn] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (res.ok) { setUsers(data.users); setTrialOn((data.trialDays ?? 0) > 0); setPlanOn(!!data.disciplinePlan); }
    else setError(data.error ?? "불러오기 실패");
    setLoading(false);
    const ov = await fetch("/api/admin/overview");
    if (ov.ok) setOverview(await ov.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patchUser(id: number, body: Record<string, unknown>) {
    setBusyId(id); setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "처리 실패"); return; }
      if (data.referralReward?.days) setNotice(`추천 보상으로 추천인과 가입자 모두 ${data.referralReward.days}일이 연장되었습니다.`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function disable2fa(u: AdminUser) {
    if (!confirm(`${u.name}님의 2단계 인증을 해제할까요?\n인증 앱과 복구 코드를 모두 잃은 사용자를 구제할 때만 사용하세요. 본인 확인을 먼저 하세요.`)) return;
    patchUser(u.id, { disable2fa: true });
  }

  function extend(u: AdminUser) {
    const v = prompt(`${u.name}님의 구독을 며칠 연장할까요? (예: 30, 365 / 줄이려면 음수)`, "30");
    if (!v) return;
    const n = Number(v);
    if (!Number.isInteger(n) || n === 0) { setError("0이 아닌 정수를 입력하세요."); return; }
    patchUser(u.id, { extendDays: n });
  }

  function subLabel(u: AdminUser) {
    if (!trialOn || u.subStatus === "off") return null;
    if (u.subStatus === "admin") return { text: "관리자", cls: "bg-gray-100 text-gray-500" };
    if (u.subStatus === "paid") return { text: `구독 ${u.subDaysLeft}일 남음`, cls: "bg-green-100 text-green-800" };
    if (u.subStatus === "trial") return { text: `체험 ${u.subDaysLeft}일 남음`, cls: "bg-blue-100 text-blue-800" };
    if (!u.subStarted) return { text: "체험 시작 전", cls: "bg-gray-100 text-gray-500" };
    return { text: "만료(읽기 전용)", cls: "bg-red-100 text-red-800" };
  }

  function setDisciplines(u: AdminUser) {
    const cur = u.disciplines ? u.disciplines.map((d) => DISCIPLINE_LABELS[d as keyof typeof DISCIPLINE_LABELS]).join(",") : "";
    const v = prompt(`${u.name}님이 유료 구독으로 쓸 수 있는 업종을 쉼표로 입력하세요.\n(${DISCIPLINES.map((d) => DISCIPLINE_LABELS[d]).join(", ")})\n비우면 전체 업종입니다.`, cur);
    if (v === null) return;
    const names = v.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) { patchUser(u.id, { disciplines: null }); return; }
    const codes = names.map((n) => DISCIPLINES.find((d) => DISCIPLINE_LABELS[d] === n));
    if (codes.some((c) => !c)) { setError("업종 이름이 올바르지 않습니다. 목록에 있는 이름 그대로 입력하세요."); return; }
    patchUser(u.id, { disciplines: codes });
  }

  function resetPassword(id: number) {
    const pw = prompt("새 비밀번호를 입력하세요 (8자 이상, 영문+숫자). 사용자는 다음 로그인 시 반드시 변경해야 합니다.");
    if (!pw) return;
    patchUser(id, { newPassword: pw });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/home" className="text-xs text-gray-400 underline shrink-0">← 홈으로</Link>
      </div>
      <h1 className="text-xl font-bold mb-6">관리자 · 가입자 관리</h1>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {notice && <p className="text-sm text-green-700 mb-3">{notice}</p>}
      <PriceUpload />
      <PumsemUpload />
      {overview && <OverviewPanel ov={overview} onDone={async (id, status) => {
        await fetch("/api/admin/overview", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inquiryId: id, status }) });
        load();
      }} />}
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : (
        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">이름 / 이메일</th>
                <th className="text-left px-3 py-2">권한</th>
                <th className="text-left px-3 py-2">상태</th>
                <th className="text-left px-3 py-2">보안</th>
                <th className="text-left px-3 py-2">구독</th>
                <th className="text-left px-3 py-2">추천코드</th>
                <th className="text-left px-3 py-2">작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-gray-400">{u.email}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {u.lastLoginAt ? `최근 접속 ${new Date(u.lastLoginAt).toLocaleDateString("ko-KR")}` : "접속 기록 없음"}
                      {u.ips7 > 0 && (
                        <span className={u.ips7 >= 5 ? "text-red-600 font-semibold" : ""} title="7일간 서로 다른 접속 IP 수. 모바일 데이터·와이파이 전환으로도 늘어나므로 공유의 증거가 아니라 참고 신호입니다.">
                          {" "}· IP {u.ips7}개(7일)/{u.ips30}개(30일)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {u.id === selfId ? (
                      <span className="text-gray-400">{u.role} (본인)</span>
                    ) : (
                      <select
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => patchUser(u.id, { role: e.target.value })}
                        className="border rounded px-2 py-1"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor[u.status]}`}>{statusLabel[u.status]}</span>
                  </td>
                  <td className="px-3 py-2 text-xs space-y-1 whitespace-nowrap">
                    <div>
                      <span className={`px-2 py-0.5 rounded-full ${u.totpEnabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                        2FA {u.totpEnabled ? "사용" : "꺼짐"}
                      </span>
                    </div>
                    <div>
                      {u.emailVerified === null ? (
                        <span className="text-gray-300">이메일 인증 대상 아님</span>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full ${u.emailVerified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                          이메일 {u.emailVerified ? "인증됨" : "미인증"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {(() => {
                      const l = subLabel(u);
                      return l ? <span className={`px-2 py-0.5 rounded-full ${l.cls}`}>{l.text}</span> : <span className="text-gray-300">-</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{u.referralCode}</td>
                  <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                    {u.id !== selfId && u.status !== "approved" && (
                      <button disabled={busyId === u.id} onClick={() => patchUser(u.id, { status: "approved" })} className="text-green-700 underline text-xs">승인</button>
                    )}
                    {u.id !== selfId && u.status !== "rejected" && (
                      <button disabled={busyId === u.id} onClick={() => patchUser(u.id, { status: "rejected" })} className="text-red-700 underline text-xs">반려</button>
                    )}
                    <button disabled={busyId === u.id} onClick={() => resetPassword(u.id)} className="text-blue-700 underline text-xs">비밀번호 재설정</button>
                    {u.id !== selfId && u.totpEnabled && (
                      <button disabled={busyId === u.id} onClick={() => disable2fa(u)} className="text-purple-700 underline text-xs">2FA 해제</button>
                    )}
                    {trialOn && u.role !== "admin" && (
                      <button disabled={busyId === u.id} onClick={() => extend(u)} className="text-orange-700 underline text-xs">구독 연장</button>
                    )}
                    {planOn && u.role !== "admin" && (
                      <button disabled={busyId === u.id} onClick={() => setDisciplines(u)} className="text-indigo-700 underline text-xs">
                        업종{u.disciplines ? `(${u.disciplines.length})` : "(전체)"}
                      </button>
                    )}
                    {u.emailVerified === false && (
                      <button disabled={busyId === u.id} onClick={() => patchUser(u.id, { verifyEmail: true })} className="text-teal-700 underline text-xs">이메일 인증 처리</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-4">
        본인의 권한/승인상태는 다른 관리자만 바꿀 수 있습니다(실수로 잠기는 것 방지).
        비밀번호 재설정 시 해당 사용자는 다음 로그인 때 반드시 새 비밀번호로 바꿔야 합니다.
      </p>
    </main>
  );
}

const FUNNEL_LABELS: Array<[string, string]> = [
  ["signups", "가입(전체)"], ["signups7d", "최근 7일 가입"], ["signups30d", "최근 30일 가입"], ["pending", "승인 대기"],
  ["approved", "승인됨"], ["loggedIn", "접속한 적 있음"], ["madeEstimate", "견적 직접 작성"],
];
const SUB_LABELS: Array<[string, string]> = [["trial", "체험 중"], ["paid", "유료"], ["expired", "만료"], ["notStarted", "체험 시작 전"]];

function OverviewPanel({ ov, onDone }: { ov: Overview; onDone: (id: number, status: "new" | "done") => void }) {
  const f = ov.funnel;
  const items = [...FUNNEL_LABELS, ...(f.subscriptionOn ? SUB_LABELS : [])];
  const open = ov.inquiries.filter((i) => i.status === "new");
  return (
    <section className="mb-6 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map(([k, label]) => (
          <div key={k} className="border rounded-lg px-3 py-2">
            <div className="text-lg font-bold">{Number(f[k] ?? 0).toLocaleString("ko-KR")}</div>
            <div className="text-[11px] text-gray-500">{label}</div>
          </div>
        ))}
      </div>
      <div className="border rounded-xl">
        <div className="px-3 py-2 border-b text-sm font-semibold">문의 {open.length > 0 && <span className="text-red-600">({open.length}건 미처리)</span>}</div>
        {ov.inquiries.length === 0 ? <p className="px-3 py-3 text-xs text-gray-400">접수된 문의가 없습니다.</p> : (
          <ul className="divide-y">
            {ov.inquiries.map((i) => (
              <li key={i.id} className={`px-3 py-2 text-xs ${i.status === "done" ? "opacity-50" : ""}`}>
                <div className="flex justify-between gap-2">
                  <span><b>{i.name}</b> · <a className="underline" href={`mailto:${i.email}`}>{i.email}</a> · {new Date(i.createdAt).toLocaleString("ko-KR")}</span>
                  <button onClick={() => onDone(i.id, i.status === "done" ? "new" : "done")} className="underline shrink-0">{i.status === "done" ? "다시 열기" : "처리 완료"}</button>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-gray-700">{i.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function PumsemUpload() {
  const [disc, setDisc] = useState<string>("electrical");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!confirm(`${DISCIPLINE_LABELS[disc as keyof typeof DISCIPLINE_LABELS]} 표준품셈 책을 이 파일로 교체합니다. 기존 책 항목은 삭제됩니다(사용자의 자재별 품셈은 그대로). 계속할까요?`)) return;
    setBusy(true); setMsg("읽는 중...");
    let rows: unknown[];
    try {
      rows = (await f.text()).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    } catch {
      setMsg("파일 형식이 올바르지 않습니다. jsonl(한 줄에 JSON 하나) 파일인지 확인하세요.");
      setBusy(false); return;
    }
    let done = 0, skipped = 0;
    for (let i = 0; i < rows.length; i += 800) {
      let res: Response;
      try {
        res = await fetch("/api/admin/pumsem-items", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discipline: disc, rows: rows.slice(i, i + 800), first: i === 0 }),
        });
      } catch {
        setMsg(`서버에 연결하지 못했습니다. (${done.toLocaleString()}건까지 올라감)`); setBusy(false); return;
      }
      const text = await res.text();
      let d: { error?: string; inserted?: number; skipped?: number } = {};
      try { d = JSON.parse(text); } catch { /* 서버가 JSON이 아닌 오류 페이지를 돌려준 경우 */ }
      if (!res.ok) { setMsg(`실패(${res.status}): ${d.error ?? text.slice(0, 120)} (${done.toLocaleString()}건까지 올라감)`); setBusy(false); return; }
      done += d.inserted ?? 0; skipped += d.skipped ?? 0;
      setMsg(`올리는 중... ${Math.min(i + 800, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
    }
    setMsg(`완료: ${done.toLocaleString()}건 등록${skipped ? `, 공수가 없어 ${skipped}건 제외` : ""}`);
    setBusy(false);
  }
  return (
    <section className="mb-6 border rounded-xl p-4 space-y-2">
      <h2 className="text-sm font-semibold">표준품셈 책 올리기</h2>
      <p className="text-xs text-gray-500">업종을 고르고 jsonl 파일을 선택하면 그 업종의 표준품셈 책이 교체됩니다. 먼저 DB 마이그레이션(0010)이 필요합니다.</p>
      <div className="flex items-center gap-2">
        <select value={disc} onChange={(e) => setDisc(e.target.value)} className="border rounded px-2 py-1 text-xs">
          {DISCIPLINES.map((d) => <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}
        </select>
        <input type="file" accept=".jsonl,.json,.txt" onChange={onFile} disabled={busy} className="text-xs" />
      </div>
      {msg && <p className="text-xs text-blue-700">{msg}</p>}
    </section>
  );
}

function PriceUpload() {
  const [disc, setDisc] = useState<string>("electrical");
  const [basis, setBasis] = useState("2026년 11월호");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!confirm(`${DISCIPLINE_LABELS[disc as keyof typeof DISCIPLINE_LABELS]} 공용 자재 단가표(${basis})를 이 파일로 교체합니다. 이 업종의 기존 공용 단가표는 삭제됩니다(사용자 계정의 자재·견적은 그대로). 계속할까요?`)) return;
    setBusy(true); setMsg("읽는 중...");
    let rows: Array<Record<string, unknown>>;
    try {
      const parsed = rowsFromTable(parseDelimited(await f.text()));
      rows = parsed.rows as unknown as Array<Record<string, unknown>>;
      if (rows.length === 0) { setMsg("읽을 수 있는 행이 없습니다. 머리글(분류, 품명, 규격, 단위, 단가, 제조사)이 있는 TSV/CSV인지 확인하세요."); setBusy(false); return; }
    } catch {
      setMsg("파일을 읽을 수 없습니다."); setBusy(false); return;
    }
    const CH = 2000;
    let done = 0, skipped = 0;
    for (let i = 0; i < rows.length; i += CH) {
      let res: Response;
      try {
        res = await fetch("/api/admin/price-items", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discipline: disc, basis, rows: rows.slice(i, i + CH), first: i === 0 }),
        });
      } catch {
        setMsg(`서버에 연결하지 못했습니다. (${done.toLocaleString()}건까지 올라감)`); setBusy(false); return;
      }
      const text = await res.text();
      let d: { error?: string; inserted?: number; skipped?: number } = {};
      try { d = JSON.parse(text); } catch { /* JSON이 아닌 오류 페이지 */ }
      if (!res.ok) { setMsg(`실패(${res.status}): ${d.error ?? text.slice(0, 120)} (${done.toLocaleString()}건까지 올라감)`); setBusy(false); return; }
      done += d.inserted ?? 0; skipped += d.skipped ?? 0;
      setMsg(`올리는 중... ${Math.min(i + CH, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
    }
    setMsg(`완료: ${done.toLocaleString()}건 등록${skipped ? `, ${skipped}건 제외` : ""}`);
    setBusy(false);
  }
  return (
    <section className="mb-6 border rounded-xl p-4 space-y-2">
      <h2 className="text-sm font-semibold">공용 자재 단가표 올리기</h2>
      <p className="text-xs text-gray-500">모든 사용자가 &quot;자재·품셈 단가&quot; 탭에서 검색하는 기준표입니다. 업종과 기준월을 정하고 TSV/CSV(머리글: 분류, 품명, 규격, 단위, 단가, 제조사)를 선택하면 그 업종의 기준표가 교체됩니다. 먼저 DB 마이그레이션(0011)이 필요합니다.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={disc} onChange={(e) => setDisc(e.target.value)} className="border rounded px-2 py-1 text-xs">
          {DISCIPLINES.map((d) => <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}
        </select>
        <input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="기준월" className="border rounded px-2 py-1 text-xs w-32" />
        <input type="file" accept=".tsv,.csv,.txt" onChange={onFile} disabled={busy} className="text-xs" />
      </div>
      {msg && <p className="text-xs text-blue-700">{msg}</p>}
    </section>
  );
}
