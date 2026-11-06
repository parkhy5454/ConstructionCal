CREATE TABLE IF NOT EXISTS "bom_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"group_name" varchar(60) NOT NULL,
	"material_id" integer NOT NULL,
	"qty" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labor_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(60) NOT NULL,
	"rate" numeric(14, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "labor_rates_user_id_code_unique" UNIQUE("user_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" varchar(40) DEFAULT '' NOT NULL,
	"name" varchar(200) NOT NULL,
	"spec" varchar(200) DEFAULT '' NOT NULL,
	"unit" varchar(20) NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pumsem" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"material_id" integer NOT NULL,
	"labor_code" varchar(20) NOT NULL,
	"factor" numeric(10, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "pumsem_user_id_material_id_unique" UNIQUE("user_id","material_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"indirect_labor" numeric(6, 4) DEFAULT '0.08' NOT NULL,
	"etc_expense" numeric(6, 4) DEFAULT '0.0549' NOT NULL,
	"industrial_ins" numeric(6, 4) DEFAULT '0.0373' NOT NULL,
	"employ_ins" numeric(6, 4) DEFAULT '0.0087' NOT NULL,
	"gna" numeric(6, 4) DEFAULT '0.06' NOT NULL,
	"profit" numeric(6, 4) DEFAULT '0.15' NOT NULL,
	"vat" numeric(6, 4) DEFAULT '0.10' NOT NULL,
	"pipe_accessory" numeric(6, 4) DEFAULT '0.15' NOT NULL,
	"consumable" numeric(6, 4) DEFAULT '0.02' NOT NULL,
	"tool_loss" numeric(6, 4) DEFAULT '0.03' NOT NULL,
	CONSTRAINT "rate_settings_user_id_unique" UNIQUE("user_id")
);
