CREATE TABLE "task_deadline_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"old_deadline" timestamp with time zone,
	"new_deadline" timestamp with time zone,
	"changed_at" timestamp with time zone NOT NULL,
	"changed_by" integer,
	"source" text NOT NULL,
	"history_id" bigint,
	CONSTRAINT "task_deadline_events_history_id_unique" UNIQUE("history_id")
);
--> statement-breakpoint
CREATE INDEX "deadline_events_task_idx" ON "task_deadline_events" USING btree ("task_id","changed_at");