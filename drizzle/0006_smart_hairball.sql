CREATE TABLE IF NOT EXISTS "subscriptions" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"paid_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
