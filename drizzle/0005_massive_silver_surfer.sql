CREATE TABLE IF NOT EXISTS "active_sessions" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"sid" varchar(32) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
