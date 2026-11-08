CREATE TABLE `asset_valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`value_cents` integer NOT NULL,
	`date_key` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `personal_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_asset_valuations_asset` ON `asset_valuations` (`asset_id`,`date_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `personal_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`cost_cents` integer NOT NULL,
	`current_value_cents` integer NOT NULL,
	`status` text DEFAULT 'holding' NOT NULL,
	`acquired_date_key` text NOT NULL,
	`closed_date_key` text,
	`sold_cents` integer,
	`note` text DEFAULT '' NOT NULL,
	`source_transaction_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_personal_assets_list` ON `personal_assets` (`status`,`acquired_date_key`);--> statement-breakpoint
CREATE INDEX `idx_personal_assets_source_tx` ON `personal_assets` (`source_transaction_id`);