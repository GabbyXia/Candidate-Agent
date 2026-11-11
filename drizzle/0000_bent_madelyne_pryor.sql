CREATE TABLE `source_collection_cache` (
	`scope_key` text PRIMARY KEY NOT NULL,
	`object_key` text,
	`retrieved_at` text,
	`coverage_json` text,
	`last_attempt_json` text
);
--> statement-breakpoint
CREATE TABLE `source_plan_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`plan_digest` text NOT NULL,
	`content_digest` text NOT NULL,
	`report_json` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `source_plan_check_history` ON `source_plan_checks` (`plan_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `source_plan_heads` (
	`scope_key` text PRIMARY KEY NOT NULL,
	`active_plan_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_key` text NOT NULL,
	`version` integer NOT NULL,
	`plan_json` text NOT NULL,
	`digest` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_plan_scope_version` ON `source_plan_versions` (`scope_key`,`version`);