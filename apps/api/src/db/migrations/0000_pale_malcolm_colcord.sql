CREATE TABLE "departments" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"head_id" integer
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" integer PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"title" text NOT NULL,
	"canonical" text,
	"sort" integer NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_run" timestamp with time zone,
	"cursor" jsonb
);
--> statement-breakpoint
CREATE TABLE "task_relations" (
	"task_id" integer NOT NULL,
	"related_id" integer NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "task_relations_task_id_related_id_kind_pk" PRIMARY KEY("task_id","related_id","kind")
);
--> statement-breakpoint
CREATE TABLE "task_stage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"from_stage" text,
	"to_stage" text,
	"from_canonical" text,
	"to_canonical" text,
	"moved_at" timestamp with time zone NOT NULL,
	"moved_by" integer,
	"source" text NOT NULL,
	"history_id" bigint,
	CONSTRAINT "task_stage_events_history_id_unique" UNIQUE("history_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"group_id" integer NOT NULL,
	"stage_id" text NOT NULL,
	"stage_title" text,
	"stage" text,
	"status" integer NOT NULL,
	"priority" integer NOT NULL,
	"responsible_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"changed_at" timestamp with time zone NOT NULL,
	"parent_id" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_issue" boolean DEFAULT false NOT NULL,
	"issue_type" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"work_position" text,
	"department_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"active" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workgroups" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_dev_project" boolean NOT NULL
);
--> statement-breakpoint
CREATE INDEX "stages_group_idx" ON "stages" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "task_relations_related_idx" ON "task_relations" USING btree ("related_id");--> statement-breakpoint
CREATE INDEX "stage_events_task_idx" ON "task_stage_events" USING btree ("task_id","moved_at");--> statement-breakpoint
CREATE INDEX "tasks_group_idx" ON "tasks" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "tasks_responsible_idx" ON "tasks" USING btree ("responsible_id");--> statement-breakpoint
CREATE INDEX "tasks_stage_idx" ON "tasks" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "tasks_is_issue_idx" ON "tasks" USING btree ("is_issue");