// 제출용 문서 7종 컴포넌트. 1~6은 A4 가로, 7(견적서 갑지)은 A4 세로이고 모든 면의 여백을 같게 맞춥니다.
// 훅이 없어 서버/클라이언트 어디서나 쓸 수 있습니다.
import type { ComputeResult } from "@/lib/calc";
import { won } from "@/components/EstimateTables";
import { buildPrintDocs, koreanMoney, costBasis, type PrintDocs } from "@/lib/printDocs";

export const PRINT_MARGIN_MM = 15;

export const PRINT_CSS = `
  @page landscape { size: A4 landscape; margin: ${PRINT_MARGIN_MM}mm; }
  @page portrait { size: A4 portrait; margin: ${PRINT_MARGIN_MM}mm; }
  .sheet { background: #fff; color: #000; margin: 0 auto 16px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; overflow-x: auto; }
  .sheet.landscape { page: landscape; max-width: calc(297mm - ${PRINT_MARGIN_MM * 2}mm + 32px); }
  .sheet.portrait { page: portrait; max-width: calc(210mm - ${PRINT_MARGIN_MM * 2}mm + 32px); }
  .sheet .doc-title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 10px; margin: 4px 0 14px; }
  .sheet .doc-title span { border-bottom: 2px solid #000; padding: 0 6px 2px; }
  .sheet .doc-sub { font-size: 12px; font-weight: 700; margin: 0 0 4px; }
  .sheet table.doc { border-collapse: collapse; width: 100%; font-size: 10.5px; table-layout: auto; }
  .sheet table.doc th, .sheet table.doc td { border: 1px solid #000; padding: 3px 5px; height: 22px; }
  .sheet table.doc th { background: #e4e4e4; font-weight: 600; text-align: center; }
  .sheet table.doc td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sheet table.doc td.c { text-align: center; }
  .sheet table.doc tr.sub td { background: #f3f3f3; font-weight: 600; }
  .sheet table.doc tr.tot td { font-weight: 700; background: #ececec; }
  .sheet table.doc tr.extra td { color: #555; }
  .sheet .blk { break-inside: avoid; margin-bottom: 8px; }
  .sheet tbody.blk { break-inside: avoid; }
  .sheet .gap td { border: none !important; height: 8px !important; padding: 0 !important; }
  @media print {
    nav, header, .no-print { display: none !important; }
    body, .min-h-screen { background: #fff !important; }
    .sheet { border: none !important; border-radius: 0 !important; padding: 0 !important; margin: 0 !important; max-width: none !important; overflow: visible !important; break-after: page; }
    .sheet:last-of-type { break-after: auto; }
    .sheet table.doc tr { break-inside: avoid; }
    .sheet table.doc thead { display: table-header-group; }
  }
  .sheet .gab { border: 2px solid #000; font-size: 12px; }
  .sheet .gab table { border-collapse: collapse; width: 100%; }
  .sheet .gab td, .sheet .gab th { border: 1px solid #000; padding: 2px 6px; height: 22px; }
  .sheet .gab th { background: transparent; font-weight: 700; text-align: center; }
  .sheet .gab .item td { height: 23px; white-space: nowrap; }
  .sheet .gab td.n { text-align: right; font-variant-numeric: tabular-nums; }
`;

const q = (n: number) => (Math.abs(n) < 1e-9 ? "" : won(n));
const qd = (n: number) => (Math.abs(n) < 1e-9 ? "" : Number.isInteger(n) ? won(n) : Number(n.toFixed(1)).toLocaleString("ko-KR"));

const GroupHead = ({ g }: { g: string }) => <div className="doc-sub">{g}</div>;
const Title = ({ children }: { children: string }) => <h2 className="doc-title"><span>{children}</span></h2>;

// 금액 열 머리(재료비/노무비/경비/합계 × 단가/금액)
function MoneyHead({ first }: { first: React.ReactNode }) {
  return (
    <thead>
      <tr>{first}<th colSpan={2}>재 료 비</th><th colSpan={2}>노 무 비</th><th colSpan={2}>경 비</th><th colSpan={2}>합 계</th><th rowSpan={2}>비 고</th></tr>
      <tr><th>단 가</th><th>금 액</th><th>단 가</th><th>금 액</th><th>단 가</th><th>금 액</th><th>단 가</th><th>금 액</th></tr>
    </thead>
  );
}
const basicHead = (<><th rowSpan={2} style={{ width: "20%" }}>품 명</th><th rowSpan={2} style={{ width: "22%" }}>규 격</th><th rowSpan={2}>단위</th><th rowSpan={2}>수 량</th></>);

export function Sheet1Quantity({ docs }: { docs: PrintDocs }) {
  return (
    <section className="sheet landscape">
      <Title>수 량 집 계 표</Title>
      {docs.quantity.map((g) => (
        <div key={g.g} className="blk">
          <GroupHead g={g.g} />
          <table className="doc">
            <thead><tr><th style={{ width: "26%" }}>품 목</th><th>규 격</th><th style={{ width: 50 }}>단위</th><th style={{ width: 80 }}>수량</th><th style={{ width: 110 }}>비 고</th></tr></thead>
            <tbody>
              {g.rows.map((r, i) => (<tr key={i}><td>{r.name}</td><td>{r.spec}</td><td className="c">{r.unit}</td><td className="n">{Number(r.qty.toFixed(3)).toLocaleString("ko-KR")}</td><td></td></tr>))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

export function Sheet2Prices({ docs }: { docs: PrintDocs }) {
  const { materials, labors } = docs.priceTable;
  return (
    <section className="sheet landscape">
      <Title>단 가 대 비 표</Title>
      <table className="doc">
        <thead>
          <tr><th rowSpan={2} style={{ width: 90 }}>번 호</th><th rowSpan={2} style={{ width: "20%" }}>품 명</th><th rowSpan={2}>규 격</th><th rowSpan={2} style={{ width: 46 }}>단위</th>
            <th colSpan={3}>조 사 단 가</th><th rowSpan={2} style={{ width: 90 }}>적용단가</th><th rowSpan={2} style={{ width: 90 }}>비 고</th></tr>
          <tr><th style={{ width: 60 }}>물가정보<br />Page</th><th style={{ width: 80 }}>A 사</th><th style={{ width: 80 }}>B 사</th></tr>
        </thead>
        <tbody>
          {materials.map((r) => (
            <tr key={r.no}><td className="c">{r.no}</td><td>{r.name}</td><td>{r.spec}</td><td className="c">{r.unit}</td><td></td><td></td><td></td><td className="n">{won(r.price)}</td><td></td></tr>
          ))}
          {labors.length > 0 && <tr className="gap"><td colSpan={9}></td></tr>}
          {labors.map((r) => (
            <tr key={r.no}><td className="c">{r.no}</td><td>{r.name}</td><td></td><td className="c">{r.unit}</td><td></td><td></td><td></td><td className="n">{won(r.price)}</td><td></td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Sheet3Ilwi({ docs }: { docs: PrintDocs }) {
  return (
    <section className="sheet landscape">
      <Title>일 위 대 가 표</Title>
      {docs.ilwi.length === 0 && <p style={{ textAlign: "center", color: "#777", fontSize: 12 }}>노무(공수)가 반영된 품목이 없어 일위대가가 없습니다.</p>}
      {docs.ilwi.length > 0 && (
        <table className="doc">
          <MoneyHead first={basicHead} />
          {docs.ilwi.map((b) => (
            <tbody key={b.no} className="blk">
              <tr><td colSpan={13} style={{ background: "#f7f7f7" }}>{b.title}</td></tr>
              {b.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.name}</td><td>{l.spec}</td><td className="c">{l.unit}</td><td className="n">{l.qty}</td>
                  <td className="n">{qd(l.unitPrice.mat)}</td><td className="n">{qd(l.mat)}</td>
                  <td className="n">{qd(l.unitPrice.labor)}</td><td className="n">{qd(l.labor)}</td>
                  <td className="n">{qd(l.unitPrice.expense)}</td><td className="n">{qd(l.expense)}</td>
                  <td className="n">{qd(l.unitPrice.mat + l.unitPrice.labor + l.unitPrice.expense)}</td><td className="n">{qd(l.mat + l.labor + l.expense)}</td><td></td>
                </tr>
              ))}
              <tr className="sub">
                <td className="c">합 계</td><td></td><td></td><td></td><td></td><td className="n">{q(b.total.mat)}</td><td></td><td className="n">{q(b.total.labor)}</td><td></td><td className="n">{q(b.total.expense)}</td><td></td><td className="n">{q(b.total.sum)}</td><td></td>
              </tr>
              <tr className="gap"><td colSpan={13}></td></tr>
            </tbody>
          ))}
        </table>
      )}
    </section>
  );
}

export function Sheet4IlwiList({ docs }: { docs: PrintDocs }) {
  return (
    <section className="sheet landscape">
      <Title>일위대가표 목록</Title>
      <table className="doc">
        <thead>
          <tr><th rowSpan={2} style={{ width: 70 }}>호 표</th><th rowSpan={2} style={{ width: "18%" }}>품 명</th><th rowSpan={2}>규 격</th><th rowSpan={2}>단위</th><th rowSpan={2}>수 량</th>
            <th colSpan={2}>재 료 비</th><th colSpan={2}>노 무 비</th><th colSpan={2}>경 비</th><th colSpan={2}>합 계</th><th rowSpan={2}>비 고</th></tr>
          <tr><th>단 가</th><th>금 액</th><th>단 가</th><th>금 액</th><th>단 가</th><th>금 액</th><th>단 가</th><th>금 액</th></tr>
        </thead>
        <tbody>
          {docs.ilwi.map((b) => (
            <tr key={b.no}>
              <td className="c">일위 {b.no}호</td><td>{b.name}</td><td>{b.spec}</td><td className="c">{b.unit}</td><td className="n">1</td>
              <td className="n">{q(b.total.mat)}</td><td className="n">{q(b.total.mat)}</td><td className="n">{q(b.total.labor)}</td><td className="n">{q(b.total.labor)}</td>
              <td className="n">{q(b.total.expense)}</td><td className="n">{q(b.total.expense)}</td><td className="n">{q(b.total.sum)}</td><td className="n">{q(b.total.sum)}</td><td></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Sheet5Detail({ docs }: { docs: PrintDocs }) {
  return (
    <section className="sheet landscape">
      <Title>공 사 예 산 내 역 서</Title>
      {docs.detail.map((g) => (
        <div key={g.g} style={{ marginBottom: 10 }}>
          <GroupHead g={g.g} />
          <table className="doc">
            <MoneyHead first={basicHead} />
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i} className={r.extra ? "extra" : undefined}>
                  <td>{r.name}</td><td>{r.spec}</td><td className="c">{r.unit}</td><td className="n">{Number(r.qty.toFixed(3)).toLocaleString("ko-KR")}</td>
                  <td className="n">{qd(r.matUnit)}</td><td className="n">{qd(r.matAmt)}</td><td className="n">{qd(r.laborUnit)}</td><td className="n">{qd(r.laborAmt)}</td>
                  <td className="n">{qd(r.expUnit)}</td><td className="n">{qd(r.expAmt)}</td><td className="n">{qd(r.sumUnit)}</td><td className="n">{qd(r.sumAmt)}</td><td className="c">{r.note}</td>
                </tr>
              ))}
              <tr className="tot">
                <td className="c">합 계</td><td></td><td></td><td></td><td></td><td className="n">{q(g.total.mat)}</td><td></td><td className="n">{q(g.total.labor)}</td><td></td><td className="n">{q(g.total.expense)}</td><td></td><td className="n">{q(g.total.sum)}</td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
      <p style={{ fontSize: 10, color: "#666", marginTop: 4 }}>* 노무비 단가는 표준품셈 공수 × 노임단가, 경비는 공구손료(노무비 기준)입니다. 품셈이 없는 품목은 재료비만 반영됩니다.</p>
    </section>
  );
}

export function Sheet6Summary({ result }: { result: ComputeResult }) {
  const rows = result.groupResults;
  const filler = Math.max(0, 9 - rows.length);
  return (
    <section className="sheet landscape">
      <Title>집 계 표</Title>
      <table className="doc">
        <MoneyHead first={basicHead} />
        <tbody>
          {rows.map((g) => (
            <tr key={g.g}>
              <td>{g.g}</td><td></td><td className="c">식</td><td className="n">1</td>
              <td className="n">{q(g.matTotal)}</td><td className="n">{q(g.matTotal)}</td><td className="n">{q(g.laborTotal)}</td><td className="n">{q(g.laborTotal)}</td>
              <td className="n">{q(g.expenseTotal)}</td><td className="n">{q(g.expenseTotal)}</td><td className="n">{q(g.groupTotal)}</td><td className="n">{q(g.groupTotal)}</td><td></td>
            </tr>
          ))}
          {Array.from({ length: filler }).map((_, i) => (<tr key={`f${i}`} style={{ height: 30 }}>{Array.from({ length: 13 }).map((__, j) => <td key={j}></td>)}</tr>))}
          <tr className="tot">
            <td className="c">합 계</td><td></td><td></td><td></td><td></td><td className="n">{q(result.sumMat)}</td><td></td><td className="n">{q(result.sumLabor)}</td><td></td><td className="n">{q(result.sumExpense)}</td><td></td><td className="n">{q(result.sumMat + result.sumLabor + result.sumExpense)}</td><td></td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export type Supplier = {
  company: string; regNo: string; address: string; bizType: string; bizItem: string;
  tel: string; fax: string; manager: string; mobile: string; email: string;
};
export type Recipient = { client: string; dept: string; contact: string; email: string; date: string };

export function Sheet7Estimate({ result, supplier, recipient, logo, seal, notes }: {
  result: ComputeResult; supplier: Supplier; recipient: Recipient; logo: string | null; seal: string | null; notes: string;
}) {
  const b = costBasis(result);
  type R = { no?: string; name: string; spec?: string; unitAmt?: number; amt?: number; bold?: boolean };
  const rows: R[] = [
    { no: "1", name: "순공사비", amt: result.directCost },
    { name: "가. 직접 재료비", amt: result.sumMat },
    { name: "나. 노무비", amt: result.laborSubtotal },
    { name: "직접노무비", unitAmt: result.sumLabor },
    { name: "간접노무비", spec: b.indirect, unitAmt: result.indirectLabor },
    { name: "다. 경비", amt: result.expenseSubtotal },
    { name: "기타경비", spec: b.etc, unitAmt: result.etcExpense },
    { name: "산재보험료", spec: b.industrial, unitAmt: result.industrialIns },
    { name: "고용보험료", spec: b.employ, unitAmt: result.employIns },
    { no: "2", name: "일반 관리비", spec: b.gna, amt: result.gna },
    { name: "소   계", amt: result.subtotal },
    { no: "3", name: "이   윤", spec: b.profit, amt: result.profit },
    { name: "계", amt: result.beforeVat },
    { no: "4", name: "부가가치세", spec: b.vat, amt: result.vat },
    { name: "합   계", amt: result.final, bold: true },
  ];
  const filler = notes.trim() ? 3 : 5;
  return (
    <section className="sheet portrait">
      <div className="gab">
        <div style={{ textAlign: "center", fontSize: 26, letterSpacing: 14, padding: "10px 0", borderBottom: "1px solid #000", fontWeight: 500 }}>견 적 서</div>
        <div style={{ display: "flex", borderBottom: "1px solid #000" }}>
          <div style={{ flex: "0 0 38%", padding: "14px 10px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, fontSize: 13 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{recipient.client ? `${recipient.client} 귀하` : "귀하"}</div>
            <div style={{ paddingLeft: 12, lineHeight: 1.9 }}>
              <div>수 신 : {recipient.dept}</div>
              <div>연락처 : {recipient.contact}</div>
              <div>E-mail : {recipient.email}</div>
              <div>발행일자 : {recipient.date}</div>
            </div>
          </div>
          <div style={{ flex: "0 0 30px", borderLeft: "1px solid #000", borderRight: "1px solid #000", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, writingMode: "vertical-rl", letterSpacing: 6 }}>공 급 자</div>
          <div style={{ flex: 1, position: "relative" }}>
            <table>
              <tbody>
                <tr>
                  <th style={{ width: 70 }}>상 호</th>
                  <td colSpan={3} style={{ position: "relative" }}>
                    {logo && <img src={logo} alt="" style={{ height: 22, verticalAlign: "middle", marginRight: 6, objectFit: "contain" }} />}
                    {supplier.company}
                    {seal && <img src={seal} alt="직인" style={{ position: "absolute", right: 4, top: -4, width: 34, height: 34, objectFit: "contain", opacity: 0.9 }} />}
                  </td>
                </tr>
                <tr><th>등록번호</th><td colSpan={3}>{supplier.regNo}</td></tr>
                <tr><th>주 소</th><td colSpan={3}>{supplier.address}</td></tr>
                <tr><th>업 태</th><td colSpan={3}>{supplier.bizType}</td></tr>
                <tr><th>종 목</th><td colSpan={3} style={{ fontSize: 10 }}>{supplier.bizItem}</td></tr>
                <tr><th>전화번호</th><td>{supplier.tel}</td><th style={{ width: 50 }}>팩 스</th><td>{supplier.fax}</td></tr>
                <tr><th>담 당 자</th><td>{supplier.manager}</td><th>휴대폰</th><td>{supplier.mobile}</td></tr>
                <tr><th>이 메 일</th><td colSpan={3}>{supplier.email}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ padding: "8px 12px", fontSize: 14, fontWeight: 700, display: "flex", gap: 24, borderBottom: "1px solid #000" }}>
          <span>합 계 :</span><span>일금 {koreanMoney(result.final)}원 정</span><span>₩{won(result.final)}</span>
        </div>
        <table>
          <thead><tr><th style={{ width: 44 }}>No.</th><th style={{ width: "20%" }}>품명</th><th style={{ width: "26%" }}>규격 및 모델</th><th style={{ width: 90 }} colSpan={2}>수량</th><th style={{ width: 100 }}>단가</th><th style={{ width: 120 }}>금액</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="item" style={r.bold ? { fontWeight: 700 } : undefined}>
                <td style={{ textAlign: "center" }}>{r.no ?? ""}</td><td>{r.name}</td><td>{r.spec ?? ""}</td><td></td><td></td>
                <td className="n">{r.unitAmt != null ? won(r.unitAmt) : ""}</td><td className="n">{r.amt != null ? won(r.amt) : ""}</td>
              </tr>
            ))}
            <tr className="item"><td></td><td></td><td></td><td></td><td></td><td></td><td className="n" style={{ fontSize: 11 }}></td></tr>
            {notes.trim() ? (
              <tr className="item"><td></td><td style={{ fontWeight: 700 }}>비 고</td><td colSpan={5} style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{notes.trim()}</td></tr>
            ) : null}
            {Array.from({ length: filler }).map((_, i) => (<tr key={`f${i}`} className="item"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export { buildPrintDocs };
