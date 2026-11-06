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
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const statusEnum = pgEnum("status", ["pending", "approved", "rejected"]);

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

// ---------- 적산(견적) 도메인 ----------
// 각 사용자가 "자신이 구매한" 물가자료/표준품셈 데이터를 보유 — 계정별로 독립적으로 관리됨

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
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
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 60 }).notNull(),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull().default("0"),
}, (t) => ({
  userCode: unique().on(t.userId, t.code),
}));

// 품셈: 자재 1개에 대해 단위당 공수(인/단위) — 자재단가 × 품셈공수 × 노임단가 = 일위대가
export const pumsem = pgTable("pumsem", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  materialId: integer("material_id").notNull(),
  laborCode: varchar("labor_code", { length: 20 }).notNull(),
  factor: numeric("factor", { precision: 10, scale: 4 }).notNull().default("0"),
}, (t) => ({
  userMaterial: unique().on(t.userId, t.materialId),
}));

// 원가 계산 비율 (간접노무비/기타경비/일반관리비/이윤/부가세 등) — 계정당 1행
export const rateSettings = pgTable("rate_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
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
});

// 견적서(프로젝트)
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
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
