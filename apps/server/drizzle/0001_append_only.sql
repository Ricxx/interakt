-- Append-only enforcement at the database level (CLAUDE.md: audit_log et al. are write-once).
-- A trigger rejects UPDATE/DELETE/TRUNCATE on append-only tables. This fires for EVERY role,
-- including the superuser the app may connect as — so a bug, injection, or stray query cannot
-- rewrite history. (A superuser could disable the trigger, but normal app code never does.)
-- Pair this with the least-privilege ces_app role (db/setup-app-role.ts) for defense-in-depth.

CREATE OR REPLACE FUNCTION ces_append_only() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'append-only table %: % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
	BEFORE UPDATE OR DELETE ON audit_log
	FOR EACH ROW EXECUTE FUNCTION ces_append_only();
--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
	BEFORE TRUNCATE ON audit_log
	FOR EACH STATEMENT EXECUTE FUNCTION ces_append_only();
