CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"task_id" integer,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "webhook_events_received_idx" ON "webhook_events" USING btree ("received_at");