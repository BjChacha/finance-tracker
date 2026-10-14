ALTER TABLE `budgets` ADD `period` text NOT NULL DEFAULT 'month';--> statement-breakpoint
DROP INDEX `uq_budgets_category`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_budgets_period_category` ON `budgets` (`period`,`category_id`);
