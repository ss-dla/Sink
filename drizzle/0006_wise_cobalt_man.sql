CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
