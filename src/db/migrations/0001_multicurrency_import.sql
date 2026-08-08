ALTER TABLE `accounts` ADD `rate_to_base` integer DEFAULT 1000000 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency` text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `exchange_rate` integer DEFAULT 1000000 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `amount_base_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `to_amount` integer;--> statement-breakpoint
-- 回填：迁移前全部为隐式 CNY（本位币），故 amount_base_cents = amount；同币种转账 to_amount = amount。
UPDATE `transactions` SET `amount_base_cents` = `amount`;--> statement-breakpoint
UPDATE `transactions` SET `to_amount` = `amount` WHERE `type` = 'transfer' AND `to_amount` IS NULL;