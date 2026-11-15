CREATE TABLE IF NOT EXISTS "price_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"discipline" "discipline" NOT NULL,
	"category" varchar(160) DEFAULT '' NOT NULL,
	"name" varchar(300) NOT NULL,
	"spec" varchar(500) DEFAULT '' NOT NULL,
	"unit" varchar(40) DEFAULT '' NOT NULL,
	"price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"maker" varchar(100) DEFAULT '' NOT NULL,
	"basis" varchar(60) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_items_discipline_idx" ON "price_items" USING btree ("discipline");