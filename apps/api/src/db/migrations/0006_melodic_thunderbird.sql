CREATE TABLE "access_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by_user" integer NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "access_grants" (
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"rights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_subject_type_subject_id_pk" PRIMARY KEY("subject_type","subject_id")
);
--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "last_sign_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "last_seen_at" timestamp with time zone;