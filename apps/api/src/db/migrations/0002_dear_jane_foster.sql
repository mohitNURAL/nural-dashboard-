ALTER TABLE "tasks" ADD COLUMN "start_date_plan" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "end_date_plan" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "date_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workgroups" ADD COLUMN "owner_id" integer;