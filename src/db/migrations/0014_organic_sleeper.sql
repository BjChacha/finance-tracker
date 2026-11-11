CREATE TABLE `categorization_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`keyword` text NOT NULL,
	`match_type` text,
	`amount_min` integer,
	`amount_max` integer,
	`category_id` text NOT NULL,
	`match_count` integer DEFAULT 0 NOT NULL,
	`last_matched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_rules_order` ON `categorization_rules` (`enabled`,`position`);--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`dedup_key` text NOT NULL,
	`period_key` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`data_json` text DEFAULT '{}' NOT NULL,
	`action_route` text,
	`status` text DEFAULT 'active' NOT NULL,
	`generated_at` integer NOT NULL,
	`acknowledged_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_insights_dedup` ON `insights` (`dedup_key`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `category_source` text DEFAULT 'manual' NOT NULL;