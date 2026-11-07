import jwt from "jsonwebtoken";
import {
  signSession, verifySession, signTwoFactorChallenge, verifyTwoFactorChallenge,
  passwordFingerprint, sessionMatchesPassword,
} from "../lib/auth";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };

const hashA = "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hashB = "$2a$12$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const challenge = signTwoFactorChallenge(5);
ok(verifySession(challenge) === null, "2FA 챌린지 토큰은 로그인 세션으로 인정되지 않음(핵심: 비밀번호만으로 세션 우회 불가)");
ok(verifyTwoFactorChallenge(challenge) === 5, "챌린지 토큰은 2FA 확인 단계에서만 유효");

const session = signSession({ uid: 5, role: "user", status: "approved", pv: passwordFingerprint(hashA) });
ok(verifyTwoFactorChallenge(session) === null, "정상 세션 토큰은 2FA 챌린지로 쓸 수 없음");
const p = verifySession(session)!;
ok(!!p && p.uid === 5, "정상 세션 토큰은 유효");
ok(sessionMatchesPassword(p, hashA), "비밀번호 그대로면 세션 유효");
ok(!sessionMatchesPassword(p, hashB), "비밀번호가 바뀌면(해시 변경) 기존 세션 무효");

const legacy = jwt.sign({ uid: 5, role: "user", status: "approved" }, process.env.JWT_SECRET!, { algorithm: "HS256", expiresIn: "7d" });
const lp = verifySession(legacy)!;
ok(!!lp && sessionMatchesPassword(lp, hashB), "배포 이전에 발급된 pv 없는 토큰은 계속 유효(다 같이 로그아웃되지 않음)");

const noRole = jwt.sign({ uid: 5 }, process.env.JWT_SECRET!, { algorithm: "HS256" });
ok(verifySession(noRole) === null, "role 없는 토큰은 세션으로 불인정");
const wrongKey = jwt.sign({ uid: 5, role: "admin", status: "approved" }, "another-secret-another-secret-another-123", { algorithm: "HS256" });
ok(verifySession(wrongKey) === null, "다른 키로 서명한 토큰 거부");
const noneAlg = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ uid: 5, role: "admin", status: "approved" })).toString("base64url") + ".";
ok(verifySession(noneAlg) === null, "alg=none 위조 토큰 거부");
const expired = jwt.sign({ uid: 5, role: "user", status: "approved" }, process.env.JWT_SECRET!, { algorithm: "HS256", expiresIn: -10 });
ok(verifySession(expired) === null && verifyTwoFactorChallenge(jwt.sign({ uid: 5, purpose: "2fa" }, process.env.JWT_SECRET!, { expiresIn: -10 })) === null, "만료된 세션/챌린지 거부");

console.log(fails ? `\n❌ ${fails}건 실패` : "\n✅ 세션 보안 로직 통과");
process.exit(fails ? 1 : 0);
