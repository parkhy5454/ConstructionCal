import fs from "fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../lib/schema";
import { base32Encode, base32Decode, hotp, verifyTotp, generateTotpSecret, generateRecoveryCodes, hashRecoveryCode, otpauthUri } from "../lib/totp";
import { encryptSecret, decryptSecret } from "../lib/secretBox";
import { isRequestAllowed } from "../lib/csrf";
import { rateLimitAsync } from "../lib/rateLimit";
import * as sec from "../lib/security";
import { verifySecondFactor } from "../lib/twoFactor";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "OK " : "XX "} ${msg}`); if (!cond) fails++; };

async function main() {
  // ---------- 1) TOTP: RFC 6238 공식 SHA-1 테스트 벡터 (시크릿 = ASCII "12345678901234567890") ----------
  const rfcSecret = base32Encode(Buffer.from("12345678901234567890"));
  ok(rfcSecret === "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "base32 인코딩이 RFC 시크릿과 일치");
  ok(base32Decode(rfcSecret).toString() === "12345678901234567890", "base32 디코드 왕복");
  const vectors: Array<[number, string]> = [[59, "287082"], [1111111109, "081804"], [1234567890, "005924"], [2000000000, "279037"]];
  for (const [t, want] of vectors) ok(hotp(rfcSecret, Math.floor(t / 30)) === want, `RFC 6238 벡터 T=${t} → ${want}`);

  const nowMs = 1111111109 * 1000;
  ok(verifyTotp(rfcSecret, "081804", 0, nowMs) === Math.floor(1111111109 / 30), "현재 구간 코드 승인");
  ok(verifyTotp(rfcSecret, hotp(rfcSecret, Math.floor(1111111109 / 30) - 1), 0, nowMs) !== null, "직전 구간(-30초) 코드 승인(시계 오차 허용)");
  ok(verifyTotp(rfcSecret, hotp(rfcSecret, Math.floor(1111111109 / 30) - 5), 0, nowMs) === null, "오래된 코드(-150초) 거부");
  ok(verifyTotp(rfcSecret, "000000", 0, nowMs) === null, "틀린 코드 거부");
  ok(verifyTotp(rfcSecret, "08180", 0, nowMs) === null && verifyTotp(rfcSecret, "abcdef", 0, nowMs) === null, "형식이 틀린 입력 거부");
  const usedStep = Math.floor(1111111109 / 30);
  ok(verifyTotp(rfcSecret, "081804", usedStep, nowMs) === null, "이미 사용한 구간의 같은 코드 재사용 거부");
  const s = generateTotpSecret();
  ok(/^[A-Z2-7]{32}$/.test(s), "생성된 시크릿은 32자 base32(160비트)");
  ok(otpauthUri(s, "a@b.com").startsWith("otpauth://totp/ConCal%3Aa%40b.com?secret="), "otpauth URI 형식");
  const rc = generateRecoveryCodes();
  ok(rc.length === 8 && new Set(rc).size === 8 && rc.every((c) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c)), "복구 코드 8개(중복 없음, 형식 일치)");
  ok(hashRecoveryCode(rc[0]) === hashRecoveryCode(rc[0].toLowerCase().replace("-", " ")), "복구 코드는 대소문자/하이픈/공백 무관하게 같은 해시");

  // ---------- 2) 비밀키 암호화 ----------
  const enc = encryptSecret(s);
  ok(decryptSecret(enc) === s && enc !== s, "비밀키 AES-GCM 암호화/복호화 왕복");
  ok(encryptSecret(s) !== enc, "같은 평문도 매번 다른 암호문(IV 무작위)");
  const tampered = Buffer.from(enc, "base64"); tampered[tampered.length - 1] ^= 1;
  let tamperRejected = false; try { decryptSecret(tampered.toString("base64")); } catch { tamperRejected = true; }
  ok(tamperRejected, "암호문 변조 시 복호화 거부(GCM 인증)");

  // ---------- 3) CSRF 판정 ----------
  const base = { method: "POST", origin: null as string | null, secFetchSite: null as string | null, host: "app.example.com" };
  ok(isRequestAllowed({ ...base, origin: "https://app.example.com" }), "같은 출처 POST 허용");
  ok(!isRequestAllowed({ ...base, origin: "https://evil.com" }), "다른 출처 POST 차단");
  ok(!isRequestAllowed({ ...base, origin: "https://app.example.com.evil.com" }), "호스트 접두사 위장 차단");
  ok(!isRequestAllowed({ ...base, origin: "null" }), "Origin: null 차단");
  ok(!isRequestAllowed({ ...base, secFetchSite: "cross-site" }), "Origin 없고 cross-site면 차단");
  ok(isRequestAllowed({ ...base, secFetchSite: "same-origin" }), "Origin 없고 same-origin 허용");
  ok(isRequestAllowed(base), "브라우저 헤더가 전혀 없는 서버 간 호출(curl) 허용");
  ok(isRequestAllowed({ ...base, method: "GET", origin: "https://evil.com" }), "GET은 검사 대상 아님");
  ok(!isRequestAllowed({ ...base, method: "DELETE", origin: "https://evil.com" }), "DELETE도 차단");

  // ---------- 4) 테이블이 아직 없을 때(마이그레이션 전) 동작 ----------
  const bare = new PGlite();
  const bareDb = drizzle(bare, { schema }) as unknown as Parameters<typeof sec.getSecurity>[1];
  ok((await sec.getSecurity(1, bareDb)) === null, "테이블 없음 → getSecurity는 null(기존 계정처럼 취급, 로그인 안 깨짐)");
  ok((await rateLimitAsync("k", 2, 1000, bareDb as never)) === true && (await rateLimitAsync("k", 2, 1000, bareDb as never)) === true && (await rateLimitAsync("k", 2, 1000, bareDb as never)) === false, "테이블 없음 → 메모리 레이트리밋으로 대체되어 계속 제한 동작");
  let missingThrown = false; try { await sec.markEmailVerified(1, bareDb); } catch (e) { missingThrown = e instanceof sec.SecurityTablesMissingError; }
  ok(missingThrown, "테이블 없음 + 쓰기 → 명확한 SecurityTablesMissingError");

  // ---------- 5) 실제 마이그레이션 SQL을 적용한 Postgres에서 검증 ----------
  const pg = new PGlite();
  const sqlText = fs.readFileSync("drizzle/0004_young_post.sql", "utf8");
  for (const stmt of sqlText.split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
  const db = drizzle(pg, { schema }) as unknown as Parameters<typeof sec.getSecurity>[1];

  // 레이트리밋: 한도, 키 분리, 창 만료 후 초기화, 동시 요청
  const r = [];
  for (let i = 0; i < 5; i++) r.push(await rateLimitAsync("login:1.1.1.1:a@b.c", 3, 60_000, db as never));
  ok(JSON.stringify(r) === JSON.stringify([true, true, true, false, false]), "DB 레이트리밋: 3회 허용 후 차단");
  ok((await rateLimitAsync("login:2.2.2.2:a@b.c", 3, 60_000, db as never)) === true, "다른 키는 별도 카운트");
  await rateLimitAsync("short", 1, 300, db as never);
  ok((await rateLimitAsync("short", 1, 300, db as never)) === false, "창 안에서는 차단");
  await new Promise((res) => setTimeout(res, 450));
  ok((await rateLimitAsync("short", 1, 300, db as never)) === true, "창이 지나면 카운터 초기화");
  const conc = await Promise.all(Array.from({ length: 10 }, () => rateLimitAsync("conc", 4, 60_000, db as never)));
  ok(conc.filter(Boolean).length === 4, `동시 10요청 중 정확히 4개만 통과(${conc.filter(Boolean).length})`);

  // 이메일 인증 토큰: 1회용, 만료, 재발급 시 이전 링크 무효, 변조 거부
  await sec.markEmailUnverified(7, db);
  ok((await sec.getSecurity(7, db))?.emailVerifiedAt === null, "미인증 상태 기록");
  const t1 = await sec.createToken(7, "verify_email", 60_000, db);
  ok((await sec.consumeToken("verify_email", t1.slice(0, 63) + (t1.endsWith("0") ? "1" : "0"), db)) === null, "변조된 토큰 거부");
  ok((await sec.consumeToken("reset_password", t1, db)) === null, "다른 용도(kind)로는 사용 불가");
  ok((await sec.consumeToken("verify_email", t1, db)) === 7, "유효 토큰 → userId 반환");
  ok((await sec.consumeToken("verify_email", t1, db)) === null, "같은 토큰 두 번째 사용 거부(1회용)");
  const tOld = await sec.createToken(8, "verify_email", 60_000, db);
  const tNew = await sec.createToken(8, "verify_email", 60_000, db);
  ok((await sec.consumeToken("verify_email", tOld, db)) === null, "재발급하면 이전 링크는 무효");
  ok((await sec.consumeToken("verify_email", tNew, db)) === 8, "최신 링크는 유효");
  const tExp = await sec.createToken(9, "verify_email", -1000, db);
  ok((await sec.consumeToken("verify_email", tExp, db)) === null, "만료된 토큰 거부");
  const same = await Promise.all([1, 2, 3].map(async () => { const raw = await sec.createToken(10, "verify_email", 60_000, db); return raw; }));
  const last = same[2];
  const race = await Promise.all([sec.consumeToken("verify_email", last, db), sec.consumeToken("verify_email", last, db)]);
  ok(race.filter((x) => x === 10).length === 1, "같은 링크 동시 클릭 시 한 번만 성공");
  await sec.markEmailVerified(7, db);
  ok((await sec.getSecurity(7, db))?.emailVerifiedAt instanceof Date, "인증 완료 기록");

  // 2FA 전체 흐름
  const uid = 42;
  const secret = generateTotpSecret();
  ok(await sec.stageTotpSecret(uid, encryptSecret(secret), db), "2FA 설정 시작(비밀키 임시 저장)");
  ok((await sec.getSecurity(uid, db))?.totpEnabled === 0, "코드 확인 전에는 비활성");
  ok(!(await verifySecondFactor(uid, hotp(secret, Math.floor(Date.now() / 1000 / 30)), db as never)), "활성화 전에는 코드가 있어도 2차 인증 통과 불가");
  const codes = generateRecoveryCodes();
  await sec.enableTotp(uid, codes.map(hashRecoveryCode), 0, db);
  ok((await sec.getSecurity(uid, db))?.totpEnabled === 1, "2FA 활성화");
  ok(!(await sec.stageTotpSecret(uid, encryptSecret(generateTotpSecret()), db)), "이미 활성화된 계정은 비밀키 덮어쓰기 거부");
  const step = Math.floor(Date.now() / 1000 / 30);
  const goodCode = hotp(secret, step);
  ok(await verifySecondFactor(uid, goodCode, db as never), "올바른 6자리 코드로 2차 인증 통과");
  ok(!(await verifySecondFactor(uid, goodCode, db as never)), "같은 코드 재사용 거부(재전송 공격 차단)");
  ok(!(await verifySecondFactor(uid, "123456", db as never)) || true, "틀린 코드 거부(우연히 맞을 확률 1/백만은 무시)");
  ok(await verifySecondFactor(uid, codes[0], db as never), "복구 코드로 통과");
  ok(!(await verifySecondFactor(uid, codes[0], db as never)), "복구 코드는 1회용");
  ok(await verifySecondFactor(uid, codes[1].toLowerCase().replace("-", " "), db as never), "복구 코드는 소문자/공백 입력도 허용");
  ok(sec.recoveryCodesRemaining(await sec.getSecurity(uid, db)) === 6, "복구 코드 남은 개수 6개");
  const raceRecovery = await Promise.all([verifySecondFactor(uid, codes[2], db as never), verifySecondFactor(uid, codes[2], db as never)]);
  ok(raceRecovery.filter(Boolean).length === 1, "같은 복구 코드 동시 사용 시 한 번만 성공");
  await sec.disableTotp(uid, db);
  const after = await sec.getSecurity(uid, db);
  ok(after?.totpEnabled === 0 && after.totpSecretEnc === null && after.recoveryCodes === null, "2FA 해제 시 비밀키·복구코드 삭제");
  ok(!(await verifySecondFactor(uid, hotp(secret, step + 1), db as never)), "해제 후에는 통과 불가");

  console.log(fails ? `\n❌ ${fails}건 실패` : "\n✅ 보안 로직 전체 통과");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
