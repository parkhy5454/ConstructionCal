CREATE TABLE IF NOT EXISTS "user_disciplines" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"disciplines" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
