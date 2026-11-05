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
| 무차별 대입 | IP/이메일 기준 간이 레이트리밋 (가입 5회/10분, 로그인 8회/10분) |
| 자기잠금 방지 | 관리자가 본인의 승인상태/권한을 스스로 바꿀 수 없음 |

**아직 안 한 것 (운영 전환 시 꼭 추가하세요):**
- 이메일 인증, 2단계 인증(2FA)
- 레이트리밋이 지금은 메모리 기반이라 서버리스 환경에서 완벽하지 않음 → Upstash Redis 등으로 교체 권장
- CSRF 토큰(현재는 sameSite=lax 쿠키로만 방어)
- 외부 보안 점검(pen test) — "완벽한 보안"은 존재하지 않으므로, 실사용자 데이터를 다루기 전 최소 1회 점검 권장

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
   - `JWT_SECRET` — `openssl rand -base64 48`로 생성한 값
5. 배포 후, 로컬에서 `DATABASE_URL`을 운영 Neon 값으로 바꿔 `npm run db:push`와 `npm run create-admin`을 한 번 실행해 스키마 생성 + 최초 관리자 계정을 만드세요.

## 폴더 구조

```
lib/
  db.ts            Neon + Drizzle 연결 (지연 초기화)
  schema.ts        users, admin_actions 테이블 정의
  auth.ts          비밀번호 해싱/검증, JWT 발급/검증, 추천코드 생성
  currentUser.ts   API 라우트용 "현재 로그인 사용자" 조회 (DB 재조회)
  serverUser.ts    서버 컴포넌트(페이지)용 동일 기능
  rateLimit.ts      간이 레이트리밋
app/
  api/auth/register, login, logout/route.ts
  api/me/route.ts                본인 정보 조회/수정
  api/admin/users/route.ts        가입자 목록(관리자)
  api/admin/users/[id]/route.ts   승인/반려/권한변경/비밀번호재설정(관리자)
  login/, signup/, dashboard/, admin/   화면
scripts/create-admin.ts   최초 관리자 생성 스크립트
```
