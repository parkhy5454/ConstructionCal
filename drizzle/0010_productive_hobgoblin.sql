CREATE TABLE IF NOT EXISTS "pumsem_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"discipline" "discipline" NOT NULL,
	"code" varchar(40) DEFAULT '' NOT NULL,
	"chapter" varchar(160) DEFAULT '' NOT NULL,
	"section" varchar(200) DEFAULT '' NOT NULL,
	"title" varchar(300) NOT NULL,
	"spec" varchar(500) DEFAULT '' NOT NULL,
	"unit" varchar(40) DEFAULT '' NOT NULL,
	"page" integer,
	"note" text DEFAULT '' NOT NULL,
	"review" text DEFAULT '' NOT NULL,
	"labors" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pumsem" DROP CONSTRAINT "pumsem_user_id_material_id_unique";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pumsem_items_discipline_idx" ON "pumsem_items" USING btree ("discipline");--> statement-breakpoint
ALTER TABLE "pumsem" ADD CONSTRAINT "pumsem_user_id_material_id_labor_code_unique" UNIQUE("user_id","material_id","labor_code");