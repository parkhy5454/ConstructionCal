CREATE TABLE IF NOT EXISTS "auth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_security" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"email_verified_at" timestamp with time zone,
	"totp_secret_enc" text,
	"totp_enabled" integer DEFAULT 0 NOT NULL,
	"totp_last_step" integer DEFAULT 0 NOT NULL,
	"recovery_codes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
