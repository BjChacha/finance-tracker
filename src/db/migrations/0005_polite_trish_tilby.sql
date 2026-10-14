ALTER TABLE `transactions` ADD `client_tag` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tx_client_tag` ON `transactions` (`client_tag`);
