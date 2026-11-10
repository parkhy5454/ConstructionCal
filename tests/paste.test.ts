import { parsePasted } from "../lib/pasteParse";
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };

const t1 = parsePasted("품명\t규격\t단위\t수량\n분전함\t방수함 sus 400*500*150\t면\t1\n전력케이블\tFCV 0.6/1KV 4C x 6㎟\tM\t100\n소계\t\t\t101\n");
ok(t1.rows.length === 2, "탭 구분: 헤더·소계 행 제외하고 2행");
ok(t1.rows[0].name === "분전함" && t1.rows[0].unit === "면" && t1.rows[0].qty === 1 && t1.rows[0].spec.startsWith("방수함"), "품명·규격·단위·수량 분리");
ok(t1.rows[1].qty === 100 && t1.rows[1].unit === "M", "두 번째 행");

const t2 = parsePasted("전선관  16C  m  1,200\n콘센트  2구  개  8");
ok(t2.rows.length === 2 && t2.rows[0].qty === 1200 && t2.rows[1].qty === 8, "공백 2칸 구분 + 천단위 쉼표 수량");

const t3 = parsePasted("접지동봉\t2\n이름만있음\n\n수량없음\t개");
ok(t3.rows.length === 1 && t3.rows[0].name === "접지동봉" && t3.rows[0].qty === 2, "품명+수량만 있어도 읽고, 수량 없는 줄은 건너뜀");
ok(t3.skipped === 2, "건너뛴 줄 수 집계");

const t4 = parsePasted("부스바\t접지 부스바\t식\t0\n접지동판\t접지 용도\tEA\t1");
ok(t4.rows.length === 1 && t4.rows[0].name === "접지동판", "수량 0 이하는 제외");
if (fails) process.exit(1);
