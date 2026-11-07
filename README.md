# 전기공사 적산기 — 인증/관리자 백엔드

Next.js + Neon Postgres(Drizzle ORM) + Vercel 배포를 전제로 만든 회원 인증/관리자 승인 시스템입니다.

## 기능

- 회원가입(추천인 코드 포함) → 관리자 승인 전까지 로그인 불가(`status: pending`)
- 로그인/로그아웃 (httpOnly 쿠키 기반 세션, 평문 비밀번호는 bcrypt로 해싱)
- 가입자 본인 정보 수정(이름/이메일/비밀번호)
- 관리자 화면: 가입자 목록 조회, 승인/반려, 권한변경(user↔admin), **비밀번호 강제 재설정**
  (재설정 시 해당 사용자는 다음 로그인 때 반드시 새 비밀번호로 변경해야 함)
- 모든 관리자 조치는 `admin_actions` 테이블에 기록(누가 언제 무엇을 했는지 추적)

## 적용된 보안 조치 (그리고 한계)

| 항목 | 적용 내용 |
|---|---|
| 비밀번호 저장 | bcrypt(cost 12) 해싱. 평문은 어디에도 저장/로그되지 않음 |
| 세션 | JWT를 httpOnly+secure+sameSite=lax 쿠키로 저장 (JS에서 탈취 불가) |
| 로그인 응답 | "이메일 또는 비밀번호가 틀렸습니다"로 통일(가입 여부 노출 방지) |
| 권한 확인 | 관리자 액션마다 토큰이 아니라 **DB에서 현재 권한을 재조회** (승인취소 후 옛 토큰 악용 방지) |
| SQL 인젝션 | Drizzle ORM의 파라미터 바인딩만 사용(문자열 조립 쿼리 없음) |
| 무차별 대입 | **DB 기반 레이트리밋**(모든 서버리스 인스턴스가 카운터 공유): 로그인은 IP+이메일 8회/10분, 이메일 20회/15분, IP 40회/10분. 가입·2FA·인증메일 재발송도 제한. DB 장애 시 메모리 방식으로 대체 |
| 로그인 타이밍 | 존재하지 않는 계정도 bcrypt 비교를 한 번 수행해 응답 시간으로 가입 여부를 알아내지 못함 |
| CSRF | `middleware.ts`가 모든 `/api` 상태 변경 요청의 Origin/Sec-Fetch-Site를 검사(다른 사이트에서 온 요청 차단) + sameSite=lax 쿠키 |
| 2단계 인증(2FA) | TOTP(RFC 6238, 인증 앱 호환). 비밀키는 AES-256-GCM으로 암호화 저장, 코드 재사용 차단, 복구 코드 8개(해시 저장, 1회용). 설정·해제에 현재 비밀번호 요구 |
| 이메일 인증 | Resend로 인증 링크 발송(1회용·24시간·해시 저장). 이메일 변경 시 재인증. **RESEND_API_KEY/EMAIL_FROM을 설정해야 켜짐** |
| 세션 폐기 | 비밀번호 변경/관리자 재설정 시 기존 세션 모두 무효(토큰에 비밀번호 지문 포함). 2FA 챌린지 토큰은 세션으로 통용되지 않음 |
| 계정 탈취 방지 | 이메일·비밀번호 변경은 현재 비밀번호 확인 필수 |
| 소유권 검증 | 모든 데이터 API가 로그인 + 소유자 확인. 자재 ID를 받는 API(BOM/품셈/도면·엑셀 반영)는 내 자재인지 검증 |
| 보안 헤더 | HSTS, X-Frame-Options=DENY, nosniff, Referrer-Policy, Permissions-Policy, CSP(frame-ancestors/base-uri/form-action/object-src) |
| 자기잠금 방지 | 관리자가 본인의 승인상태/권한을 스스로 바꿀 수 없음 |

### 운영 전 체크리스트

1. **DB 마이그레이션(필수)**: 운영 DB에 `npm run db:push`를 실행하세요. 새 테이블 3개(`user_security`, `auth_tokens`, `rate_limits`)만 추가되며 기존 데이터는 건드리지 않습니다.
   코드를 먼저 배포하고 마이그레이션을 나중에 해도 로그인은 깨지지 않습니다(새 기능만 비활성/메모리 방식으로 동작).
2. **이메일 인증 켜기(선택)**: Resend 가입 → 도메인 인증 → Vercel 환경변수에 `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` 추가. 설정 전에는 이메일 인증이 요구되지 않습니다.
   기존 가입자는 인증 대상이 아니며(행 없음), 새 가입자부터 적용됩니다.
3. **관리자 계정에 2FA 켜기**: 로그인 후 "내 정보 → 2단계 인증". 복구 코드는 꼭 별도 보관하세요.
4. 2FA를 켠 사용자가 인증 앱과 복구 코드를 모두 잃으면 DB의 `user_security` 행에서 `totp_enabled=0`으로 직접 해제해야 합니다(관리자 화면에는 아직 해제 기능이 없음).

**알려진 한계 / 아직 안 한 것:**
- 외부 전문가의 모의해킹(pen test)은 별도로 받아야 합니다. 이 저장소에는 코드 자체 점검(인증·소유권·입력검증·의존성)까지만 반영돼 있습니다. 실사용자 데이터를 받기 전 1회 점검을 권장합니다.
- 비밀번호 재설정(분실) 메일 기능은 없습니다 — 현재는 관리자가 비밀번호를 재설정합니다.
- `mustChangePassword`(관리자 재설정 후 강제 변경)는 화면 이동으로만 안내되며 API에서 강제하지는 않습니다(재설정 시 기존 세션은 무효화됨).
- 이 기능 배포 **이전**에 발급된 세션 토큰은 비밀번호 폐기 기능의 적용을 받지 않으며 최대 7일 뒤 자연 만료됩니다.
- 의존성: Next.js 14.2.35(14.x 최신)로 올렸지만, `npm audit`은 Next 15.5.x/16에서만 고쳐지는 항목(이미지 최적화·i18n·Server Actions·커스텀 서버 등 이 앱이 쓰지 않는 기능 위주)과
  drizzle-orm(<0.45.2, 식별자에 사용자 입력을 쓰지 않아 현재 코드에서는 악용 경로 없음)을 계속 경고합니다. Next 15+/drizzle 0.45+ 업그레이드는 별도 작업으로 계획하세요.

## 로컬 개발 설정

```bash
npm install
cp .env.example .env.local
# .env.local에 DATABASE_URL(Neon 연결문자열), JWT_SECRET(openssl rand -base64 48) 채우기

npm run db:push        # Drizzle 스키마를 Neon DB에 반영
npm run create-admin -- "관리자이름" admin@example.com "비밀번호123"   # 최초 관리자 생성
npm run dev
```

## 배포 (GitHub → Vercel → Neon)

1. **Neon**: neon.tech에서 프로젝트 생성 → 연결 문자열(`DATABASE_URL`) 복사
   (또는 Vercel 대시보드 → Storage → Neon 통합을 추가하면 자동으로 연동/환경변수 설정됨)
2. **GitHub**: 이 폴더를 새 리포지토리로 push
3. **Vercel**: 그 리포지토리를 Import → 프레임워크는 Next.js 자동 인식
4. **환경변수** (Vercel 프로젝트 설정 → Environment Variables):
   - `DATABASE_URL` — Neon 연결 문자열
   - `JWT_SECRET` — `openssl rand -base64 48`로 생성한 값 (2FA 비밀키 암호화 키 파생에도 쓰이므로 **분실·교체하면 기존 2FA 비밀키를 복호화할 수 없습니다**)
   - (선택) `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` — 이메일 인증용
5. 배포 후, 로컬에서 `DATABASE_URL`을 운영 Neon 값으로 바꿔 `npm run db:push`와 `npm run create-admin`을 한 번 실행해 스키마 생성 + 최초 관리자 계정을 만드세요.

## 폴더 구조

```
lib/
  db.ts            Neon + Drizzle 연결 (지연 초기화)
  schema.ts        users, admin_actions 테이블 정의
  auth.ts          비밀번호 해싱/검증, JWT 발급/검증, 추천코드 생성
  currentUser.ts   API 라우트용 "현재 로그인 사용자" 조회 (DB 재조회)
  serverUser.ts    서버 컴포넌트(페이지)용 동일 기능
  rateLimit.ts      DB 기반 레이트리밋(+메모리 대체)
  security.ts       이메일 인증/2FA 상태·1회용 토큰 저장(새 테이블 사용)
  totp.ts, secretBox.ts, twoFactor.ts   TOTP/비밀키 암호화/2차 인증 검증
  mailer.ts         Resend 메일 발송
  csrf.ts           Origin 검사 판정 로직(middleware.ts에서 사용)
app/
  api/auth/register, login, logout/route.ts
  api/me/route.ts                본인 정보 조회/수정
  api/admin/users/route.ts        가입자 목록(관리자)
  api/admin/users/[id]/route.ts   승인/반려/권한변경/비밀번호재설정(관리자)
  login/, signup/, dashboard/, admin/   화면
scripts/create-admin.ts   최초 관리자 생성 스크립트
```

## 계정 공유 방지 (동시 로그인 1대 제한)

- 한 계정은 동시에 한 기기에서만 로그인됩니다. 새 기기에서 로그인하면 기존 기기 세션은 즉시 무효가 됩니다(`active_sessions` 테이블, 마이그레이션 `0005`).
- 운영 DB에 `npm run db:push`를 하기 전에는 제한 없이 동작하며(기존 로그인은 유지), push 이후 새로 로그인한 계정부터 적용됩니다.
- 끄려면 환경변수 `SINGLE_SESSION=false`.
- 한계: 기기 지문/IP 기반 탐지는 하지 않습니다. 같은 사람이 PC·폰을 번갈아 쓰면 그때마다 다시 로그인해야 합니다.
