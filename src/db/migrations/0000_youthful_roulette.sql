CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`initial_balance` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`include_in_total` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`amount` integer NOT NULL,
	`alert_pct` integer DEFAULT 80 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_budgets_category` ON `budgets` (`category_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_preset` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_categories_type` ON `categories` (`type`,`archived`,`sort_order`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`adapter_id` text NOT NULL,
	`source_name` text NOT NULL,
	`imported_at` integer NOT NULL,
	`tx_count` integer NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`adapter_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_label` text NOT NULL,
	`target_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_import_mappings` ON `import_mappings` (`adapter_id`,`kind`,`source_label`);--> statement-breakpoint
CREATE TABLE `recurring_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`category_id` text,
	`note` text DEFAULT '' NOT NULL,
	`frequency` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`anchor` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`next_run_date` text NOT NULL,
	`last_run_date` text,
	`auto_create` integer DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recurring_next` ON `recurring_rules` (`enabled`,`next_run_date`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`fee` integer DEFAULT 0 NOT NULL,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`category_id` text,
	`date` integer NOT NULL,
	`date_key` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`recurring_rule_id` text,
	`import_batch_id` text,
	`fingerprint` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tx_date` ON `transactions` (`date_key`);--> statement-breakpoint
CREATE INDEX `idx_tx_account` ON `transactions` (`account_id`,`date_key`);--> statement-breakpoint
CREATE INDEX `idx_tx_to_account` ON `transactions` (`to_account_id`,`date_key`);--> statement-breakpoint
CREATE INDEX `idx_tx_category` ON `transactions` (`category_id`,`date_key`);--> statement-breakpoint
CREATE INDEX `idx_tx_fingerprint` ON `transactions` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_tx_batch` ON `transactions` (`import_batch_id`);