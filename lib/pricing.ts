// 요금 정보(표시용). 금액은 부가세 별도, 계정 1개(1인) 기준.
export const PRICE_MONTHLY = 29_900;
export const PRICE_YEARLY = 299_000; // 월 요금 10개월 치(2개월 할인)
export const won = (n: number) => n.toLocaleString("ko-KR");
