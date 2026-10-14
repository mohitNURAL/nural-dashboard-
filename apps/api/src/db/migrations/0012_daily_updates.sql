CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"day" text NOT NULL,
	"plan" jsonb,
	"planned_at" timestamp with time zone,
	"wrap" jsonb,
	"wrapped_at" timestamp with time zone,
	"slack_channel" text,
	"slack_ts" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_updates_user_day" ON "daily_updates" USING btree ("user_id","day");