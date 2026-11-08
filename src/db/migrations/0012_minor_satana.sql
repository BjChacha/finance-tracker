ALTER TABLE `personal_assets` ADD `installment_periods` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_down_payment_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_interest_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_annual_rate_scaled` integer;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_first_due_date_key` text;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_account_id` text;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_category_id` text;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_rule_id` text;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_auto_create` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_closed_date_key` text;--> statement-breakpoint
ALTER TABLE `personal_assets` ADD `installment_down_payment_transaction_id` text;--> statement-breakpoint
CREATE INDEX `idx_personal_assets_installment_rule` ON `personal_assets` (`installment_rule_id`);