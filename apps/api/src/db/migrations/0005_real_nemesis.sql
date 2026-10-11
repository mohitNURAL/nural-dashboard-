CREATE TABLE "user_prefs" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"login_count" integer DEFAULT 0 NOT NULL,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tour" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
