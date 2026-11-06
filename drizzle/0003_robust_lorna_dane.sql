DO $$ BEGIN
 CREATE TYPE "public"."discipline" AS ENUM('electrical', 'telecom', 'fire', 'mechanical', 'civil', 'architecture');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "dxf_mappings" DROP CONSTRAINT "dxf_mappings_user_id_match_type_match_name_unique";--> statement-breakpoint
ALTER TABLE "labor_rates" DROP CONSTRAINT "labor_rates_user_id_code_unique";--> statement-breakpoint
ALTER TABLE "rate_settings" DROP CONSTRAINT "rate_settings_user_id_unique";--> statement-breakpoint
ALTER TABLE "dxf_mappings" ADD COLUMN "discipline" "discipline" DEFAULT 'electrical' NOT NULL;--> statement-breakpoint
ALTER TABLE "labor_rates" ADD COLUMN "discipline" "discipline" DEFAULT 'electrical' NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "discipline" "discipline" DEFAULT 'electrical' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "discipline" "discipline" DEFAULT 'electrical' NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_settings" ADD COLUMN "discipline" "discipline" DEFAULT 'electrical' NOT NULL;--> statement-breakpoint
ALTER TABLE "dxf_mappings" ADD CONSTRAINT "dxf_mappings_user_id_discipline_match_type_match_name_unique" UNIQUE("user_id","discipline","match_type","match_name");--> statement-breakpoint
ALTER TABLE "labor_rates" ADD CONSTRAINT "labor_rates_user_id_discipline_code_unique" UNIQUE("user_id","discipline","code");--> statement-breakpoint
ALTER TABLE "rate_settings" ADD CONSTRAINT "rate_settings_user_id_discipline_unique" UNIQUE("user_id","discipline");