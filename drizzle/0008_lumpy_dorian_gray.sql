CREATE TABLE IF NOT EXISTS "inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" varchar(80) NOT NULL,
	"email" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"status" varchar(10) DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip" varchar(64) DEFAULT '' NOT NULL,
	"user_agent" varchar(200) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notice_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(30) NOT NULL,
	"ref" varchar(40) DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notice_log_user_id_kind_ref_unique" UNIQUE("user_id","kind","ref")
);
--> statement-breakpoint
ALTER TABLE "project_meta" ADD COLUMN "price_basis" varchar(80);