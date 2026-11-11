import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  pgEnum,
  integer,
  numeric,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const statusEnum = pgEnum("status", ["pending", "approved", "rejected"]);
// 업종(공종분야) — 전기/통신/소방/기계/토목/건축: 자재·품셈·원가비율이 업종별로 완전히 다름
export const disciplineEnum = pgEnum("discipline", ["electrical", "telecom", "fire", "mechanical", "civil", "architecture"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("user"),
  status: statusEnum("status").notNull().default("pending"), // 관리자 승인 전까지 pending
  referralCode: varchar("referral_code", { length: 16 }).notNull().unique(),
  referredBy: varchar("referred_by", { length: 16 }), // 나를 추천한 사람의 referral_code
  mustChangePassword: integer("must_change_password").notNull().default(0), // 관리자가 비번 재설정 시 1
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 관리자 조치 이력 (승인/반려/권한변경/비밀번호 재설정) - 책임추적성 확보
export const adminActions = pgTable("admin_actions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull(),
  targetUserId: integer("target_user_id").notNull(),
  action: varchar("action", { length: 40 }).notNull(), // approve | reject | set_role | reset_password | edit_profile
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- 보안 부가 상태 (기존 users 테이블을 건드리지 않도록 별도 테이블로 분리) ----------
// 이 테이블들이 아직 DB에 없어도(마이그레이션 전) 기존 로그인이 깨지지 않도록 코드가 방어합니다(lib/security.ts).

// 이메일 인증 여부 + TOTP 2단계 인증 상태. 행이 없으면 "기능을 쓰지 않는 기존 계정"으로 간주합니다.
export const userSecurity = pgTable("user_security", {
  userId: integer("user_id").primaryKey(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }), // null이면 미인증
  totpSecretEnc: text("totp_secret_enc"), // AES-256-GCM으로 암호화한 TOTP 비밀키
  totpEnabled: integer("totp_enabled").notNull().default(0),
  totpLastStep: integer("totp_last_step").notNull().default(0), // 마지막으로 사용된 30초 구간(코드 재사용 차단)
  recoveryCodes: text("recovery_codes"), // 복구 코드의 SHA-256 해시 배열(JSON). 평문은 발급 시 1회만 보여줌
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 계정당 동시 로그인 1대 제한: 사용자별로 "현재 유효한 세션 ID" 하나만 보관합니다. 새로 로그인하면 덮어써서 이전 기기는 로그아웃됩니다.
export const activeSessions = pgTable("active_sessions", {
  userId: integer("user_id").primaryKey(),
  sid: varchar("sid", { length: 32 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- 견적서 부가 정보 / 거래처 / 버전 이력 / 공유 링크 (모두 새 테이블: 기존 테이블을 건드리지 않음) ----------

// 견적서별 부가 설정: 할증(JSON), 진행 상태, 거래처, 메모. 행이 없으면 기본값으로 간주.
export const projectMeta = pgTable("project_meta", {
  projectId: integer("project_id").primaryKey(),
  surcharges: text("surcharges"), // JSON: Surcharge[]
  status: varchar("status", { length: 12 }).notNull().default("draft"), // draft | submitted | won | lost
  clientId: integer("client_id"),
  memo: text("memo"),
  priceBasis: varchar("price_basis", { length: 80 }), // 단가 기준(예: 종합물가정보 2026년 11월호) — 제출 문서에 표기
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  contact: varchar("contact", { length: 80 }),
  phone: varchar("phone", { length: 40 }),
  email: varchar("email", { length: 255 }),
  address: varchar("address", { length: 255 }),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 견적서 시점 저장본(BOM + 할증 + 합계 스냅샷, JSON)
export const projectVersions = pgTable("project_versions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  label: varchar("label", { length: 80 }).notNull(),
  snapshot: text("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 읽기 전용 공유 링크. 토큰 원문은 만든 직후 한 번만 보여주고 DB에는 SHA-256 해시만 저장합니다.
export const shareLinks = pgTable("share_links", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  viewCount: integer("view_count").notNull().default(0),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- 알림 중복 방지 / 접속 기록 / 문의 ----------

// 같은 알림(체험 종료 안내 등)을 두 번 보내지 않기 위한 기록. (user, kind, ref)가 같으면 한 번만.
export const noticeLog = pgTable("notice_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  kind: varchar("kind", { length: 30 }).notNull(),
  ref: varchar("ref", { length: 40 }).notNull().default(""),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.userId, t.kind, t.ref),
}));

// 로그인 성공 기록(보안 알림·계정 공유 의심 지표용). 90일이 지나면 삭제합니다.
export const loginEvents = pgTable("login_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  ip: varchar("ip", { length: 64 }).notNull().default(""),
  userAgent: varchar("user_agent", { length: 200 }).notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 문의하기 접수 내역
export const inquiries = pgTable("inquiries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: varchar("name", { length: 80 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 10 }).notNull().default("new"), // new | done
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 구독 상태: 무료 체험 종료일과 유료 이용 만료일. 결제 연동 전에는 관리자가 paid_until을 직접 연장합니다.
export const subscriptions = pgTable("subscriptions", {
  userId: integer("user_id").primaryKey(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  paidUntil: timestamp("paid_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 공종별 요금제: 유료 구독자가 쓸 수 있는 공종 목록(쉼표 구분). 행이 없으면 전체 공종(기존 사용자 보호).
export const userDisciplines = pgTable("user_disciplines", {
  userId: integer("user_id").primaryKey(),
  disciplines: text("disciplines").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 1회용 토큰(이메일 인증 링크). 원문은 메일로만 나가고 DB에는 SHA-256 해시만 저장합니다.
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  kind: varchar("kind", { length: 20 }).notNull(), // verify_email
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 서버리스 인스턴스 간에 공유되는 레이트리밋 카운터(메모리 방식은 인스턴스마다 따로 세어 우회되기 쉬움).
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 200 }).primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

// ---------- 적산(견적) 도메인 ----------
// 각 사용자가 "자신이 구매한" 물가자료/표준품셈 데이터를 보유 — 계정별로 독립적으로 관리됨

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  discipline: disciplineEnum("discipline").notNull().default("electrical"),
  category: varchar("category", { length: 40 }).notNull().default(""), // 전선관|전선|기구 등 (배관부속재/소모잡자재 산식에 사용)
  name: varchar("name", { length: 200 }).notNull(),
  spec: varchar("spec", { length: 200 }).notNull().default(""),
  unit: varchar("unit", { length: 20 }).notNull(),
  price: numeric("price", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const laborRates = pgTable("labor_rates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  discipline: disciplineEnum("discipline").notNull().default("electrical"),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 60 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull().default("0"),
}, (t) => ({
  userCode: unique().on(t.userId, t.discipline, t.code),
}));

// 품셈: 자재 1개에 대해 단위당 공수(인/단위) — 자재단가 × 품셈공수 × 노임단가 = 일위대가
export const pumsem = pgTable("pumsem", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  materialId: integer("material_id").notNull(),
  laborCode: varchar("labor_code", { length: 20 }).notNull(),
  factor: numeric("factor", { precision: 10, scale: 4 }).notNull().default("0"),
}, (t) => ({
  // 자재 하나에 직종이 여러 개(예: 전공 + 보통인부)일 수 있으므로 (사용자, 자재, 직종)이 유일합니다.
  userMaterialLabor: unique().on(t.userId, t.materialId, t.laborCode),
}));

// 표준품셈 책(공종 중심) 마스터: 업종별로 공종(표 제목)·규격·기준단위와 직종별 공수를 담습니다. 모든 사용자가 같이 읽고,
// 사용자는 이 중에서 자기 자재에 연결(적용)해 pumsem(자재별 공수)로 복사해 씁니다. labors는 JSON [{name, factor, qualifier?}].
export const pumsemItems = pgTable("pumsem_items", {
  id: serial("id").primaryKey(),
  discipline: disciplineEnum("discipline").notNull(),
  code: varchar("code", { length: 40 }).notNull().default(""),
  chapter: varchar("chapter", { length: 160 }).notNull().default(""),
  section: varchar("section", { length: 200 }).notNull().default(""),
  title: varchar("title", { length: 300 }).notNull(),
  spec: varchar("spec", { length: 500 }).notNull().default(""),
  unit: varchar("unit", { length: 40 }).notNull().default(""),
  page: integer("page"),
  note: text("note").notNull().default(""),
  review: text("review").notNull().default(""),
  labors: text("labors").notNull().default("[]"),
}, (t) => ({
  byDiscipline: index("pumsem_items_discipline_idx").on(t.discipline),
}));

// 원가 계산 비율 (간접노무비/기타경비/일반관리비/이윤/부가세 등) — 계정×업종당 1행
// (전기공사업/정보통신공사업/소방시설공사업/기계설비공사업 등 업종별로 법정 고시 비율이 다름)
export const rateSettings = pgTable("rate_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  discipline: disciplineEnum("discipline").notNull().default("electrical"),
  indirectLabor: numeric("indirect_labor", { precision: 6, scale: 4 }).notNull().default("0.08"),
  etcExpense: numeric("etc_expense", { precision: 6, scale: 4 }).notNull().default("0.0549"),
  industrialIns: numeric("industrial_ins", { precision: 6, scale: 4 }).notNull().default("0.0373"),
  employIns: numeric("employ_ins", { precision: 6, scale: 4 }).notNull().default("0.0087"),
  gna: numeric("gna", { precision: 6, scale: 4 }).notNull().default("0.06"),
  profit: numeric("profit", { precision: 6, scale: 4 }).notNull().default("0.15"),
  vat: numeric("vat", { precision: 6, scale: 4 }).notNull().default("0.10"),
  pipeAccessory: numeric("pipe_accessory", { precision: 6, scale: 4 }).notNull().default("0.15"),
  consumable: numeric("consumable", { precision: 6, scale: 4 }).notNull().default("0.02"),
  toolLoss: numeric("tool_loss", { precision: 6, scale: 4 }).notNull().default("0.03"),
}, (t) => ({
  userDiscipline: unique().on(t.userId, t.discipline),
}));

// 견적서(프로젝트)
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  discipline: disciplineEnum("discipline").notNull().default("electrical"),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 견적서 내 BOM(물량) 입력 행 — 공종 그룹별로 자재를 묶어 수량을 입력
export const bomItems = pgTable("bom_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  groupName: varchar("group_name", { length: 60 }).notNull(), // 공종 (예: 1.전열공사)
  materialId: integer("material_id").notNull(),
  qty: numeric("qty", { precision: 14, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// DXF 도면의 레이어명/블록명 ↔ 자재 매핑 (사용자가 한 번 지정하면 다음 업로드부터 자동 제안)
export const dxfMappings = pgTable("dxf_mappings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  discipline: disciplineEnum("discipline").notNull().default("electrical"),
  matchType: varchar("match_type", { length: 10 }).notNull(), // "layer" | "block"
  matchName: varchar("match_name", { length: 200 }).notNull(), // 레이어명 또는 블록명
  materialId: integer("material_id").notNull(),
  groupName: varchar("group_name", { length: 60 }).notNull().default(""), // 자동 배정할 공종
  unitScale: numeric("unit_scale", { precision: 14, scale: 6 }).notNull().default("1"), // 도면단위→자재단위 환산 배수 (길이: mm도면이면 0.001 등, 개수: 1)
}, (t) => ({
  userMatch: unique().on(t.userId, t.discipline, t.matchType, t.matchName),
}));
