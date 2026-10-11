CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"dept" text NOT NULL,
	"topic" text NOT NULL,
	"needs" text[] DEFAULT '{}'::text[] NOT NULL,
	"frequency" text,
	"problem" text NOT NULL,
	"manual_reports" text,
	"decision" text,
	"priority" text NOT NULL,
	"rating" integer,
	"details" text,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_note" text
);
--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id","at");