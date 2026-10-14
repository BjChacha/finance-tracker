INSERT OR IGNORE INTO `categories` (`id`, `name`, `type`, `icon`, `color`, `parent_id`, `sort_order`, `is_preset`, `archived`) VALUES
  ('preset-transfer-account', '账户互转', 'transfer', 'arrow-left-right', '#3B82F6', NULL, 0, 1, 0),
  ('preset-transfer-bill-repayment', '账单还款', 'transfer', 'credit-card', '#8B5CF6', NULL, 1, 1, 0),
  ('preset-transfer-withdrawal', '取钱', 'transfer', 'banknote', '#F59E0B', NULL, 2, 1, 0),
  ('preset-transfer-deposit', '存钱', 'transfer', 'piggy-bank', '#10B981', NULL, 3, 1, 0),
  ('preset-transfer-other', '其他', 'transfer', 'package', '#9CA3AF', NULL, 4, 1, 0);
--> statement-breakpoint
UPDATE `transactions`
SET `category_id` = 'preset-transfer-other'
WHERE `type` = 'transfer' AND `category_id` IS NULL;
--> statement-breakpoint
UPDATE `recurring_rules`
SET `category_id` = 'preset-transfer-other'
WHERE `type` = 'transfer' AND `category_id` IS NULL;
