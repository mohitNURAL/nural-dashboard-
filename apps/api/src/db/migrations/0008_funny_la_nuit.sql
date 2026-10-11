CREATE TABLE "help_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"about_kind" text NOT NULL,
	"about_id" integer,
	"about_label" text,
	"title" text NOT NULL,
	"details" text NOT NULL,
	"impact" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_note" text
);
--> statement-breakpoint
CREATE TABLE "help_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"feedback_id" integer NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "first_sign_in_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "help_feedback_user_idx" ON "help_feedback" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "help_files_feedback_idx" ON "help_files" USING btree ("feedback_id");