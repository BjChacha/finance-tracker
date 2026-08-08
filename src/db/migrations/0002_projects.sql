CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_projects_list` ON `projects` (`archived`,`sort_order`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `project_id` text;--> statement-breakpoint
CREATE INDEX `idx_tx_project` ON `transactions` (`project_id`,`date_key`);
