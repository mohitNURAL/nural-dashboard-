CREATE TABLE "workflow_versions" (
	"version" integer PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by_user" integer NOT NULL,
	"definition" jsonb NOT NULL
);
