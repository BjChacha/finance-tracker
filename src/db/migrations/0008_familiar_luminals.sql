CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`period_key` text NOT NULL,
	`snapshot` text NOT NULL,
	`analysis` text NOT NULL,
	`model` text NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`generated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_reports_period_key` ON `reports` (`period`,`period_key`);