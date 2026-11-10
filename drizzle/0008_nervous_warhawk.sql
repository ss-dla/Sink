CREATE TABLE `link_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`actor_email` text NOT NULL,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`slug` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `link_audit_slug_id_idx` ON `link_audit` (`slug`,`id`);--> statement-breakpoint
CREATE INDEX `link_audit_actor_email_id_idx` ON `link_audit` (`actor_email`,`id`);