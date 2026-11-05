import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  pgEnum,
  integer,
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
