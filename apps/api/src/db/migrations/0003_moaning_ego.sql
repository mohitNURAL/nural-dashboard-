CREATE TABLE "task_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"action" text NOT NULL,
	"from_value" text,
	"to_value" text NOT NULL,
	"ok" boolean NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "user_tokens" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "task_actions_task_idx" ON "task_actions" USING btree ("task_id","at");