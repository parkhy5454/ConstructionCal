CREATE TABLE IF NOT EXISTS "dxf_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"match_type" varchar(10) NOT NULL,
	"match_name" varchar(200) NOT NULL,
	"material_id" integer NOT NULL,
	"group_name" varchar(60) DEFAULT '' NOT NULL,
	"unit_scale" numeric(14, 6) DEFAULT '1' NOT NULL,
	CONSTRAINT "dxf_mappings_user_id_match_type_match_name_unique" UNIQUE("user_id","match_type","match_name")
);
