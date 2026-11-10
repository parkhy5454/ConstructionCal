import { parsePages } from "../lib/pdfImport";
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };

// 글자 한 조각: [글자, x, y]
const it = (s: string, x: number, y: number) => ({ str: s, transform: [1, 0, 0, 1, x, y], width: s.length * 8 });
const row = (y: number, name: string, spec: string, unit: string, qty: string) =>
  [it(name, 40, y), it(spec, 160, y), it(unit, 330, y), it(qty, 390, y)];

const page1 = [
  it("수 량 집 계 표", 220, 800),
  it("품명", 40, 760), it("규격", 160, 760), it("단위", 330, 760), it("수량", 390, 760),
  it("전기공사", 40, 740),
  ...row(720, "분전함", "방수함 sus 400*500*150", "면", "1"),
  ...row(700, "전력케이블", "FCV 0.6/1KV 4C x 6㎟", "M", "1,200"),
  ...row(680, "접지동봉", "Φ16*1800mm", "EA", "2"),
  ...row(660, "소계", "", "", "1,203"),
];
const r = parsePages([page1], 1);
ok(r.rows.length === 3, `표 행 3개 읽음(소계 제외): ${r.rows.length}`);
ok(r.rows[0]?.name === "분전함" && r.rows[0].unit === "면" && r.rows[0].qty === 1, "품명·단위·수량 분리");
ok(r.rows[1]?.qty === 1200 && r.rows[1].spec.startsWith("FCV"), "천단위 쉼표 수량·규격");
ok(r.rows[0]?.groupName === "전기공사", "제목 행을 공종으로 사용");
ok(r.hasText === true, "글자 있음");

// 일위대가표 같은 보조 쪽은 기본 제외
const aux = parsePages([[it("일 위 대 가 표", 220, 800), ...page1.slice(1)]], 1);
ok(aux.sheets.length === 1 && aux.sheets[0].defaultInclude === false, "일위대가표 쪽은 기본 제외");

// 글자 없는 PDF(스캔본)
const empty = parsePages([[]], 1);
ok(empty.rows.length === 0 && empty.hasText === false && empty.warnings.length > 0, "스캔본은 경고");
if (fails) process.exit(1);
