CREATE TABLE "people_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" integer,
	"action" text NOT NULL,
	"from_value" text,
	"to_value" text NOT NULL,
	"ok" boolean NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "people_actions_at_idx" ON "people_actions" USING btree ("at");