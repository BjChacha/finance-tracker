CREATE TABLE `llm_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`cache_hit_tokens` integer DEFAULT 0 NOT NULL,
	`cache_miss_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`price_tier` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_llm_usage_created` ON `llm_usage` (`created_at`);