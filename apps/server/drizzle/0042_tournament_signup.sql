ALTER TABLE "tournament_players" ALTER COLUMN "seed" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "rounds" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD COLUMN "state" text DEFAULT 'ACCEPTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "join_policy" text DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "requirements" text;