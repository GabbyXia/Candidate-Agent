CREATE TABLE `mapping_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`input_json` text NOT NULL,
	`plan_json` text NOT NULL,
	`state` text NOT NULL,
	`stage` text NOT NULL,
	`progress_json` text NOT NULL,
	`result_object_key` text,
	`lease_owner` text,
	`lease_expires_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `mapping_run_updated` ON `mapping_runs` (`updated_at`);--> statement-breakpoint
CREATE TABLE `mapping_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`scope_json` text NOT NULL,
	`state` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`result_object_key` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`lease_expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mapping_task_scope` ON `mapping_tasks` (`run_id`,`kind`,`scope_json`);--> statement-breakpoint
CREATE INDEX `mapping_task_queue` ON `mapping_tasks` (`run_id`,`kind`,`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `mapping_task_leases` ON `mapping_tasks` (`run_id`,`state`,`lease_expires_at`);