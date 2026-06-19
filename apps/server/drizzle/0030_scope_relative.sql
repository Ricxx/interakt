-- Capability reach went from named tiers (DEPT/DIVISION) to relative reach (SELF/NODE/ORG).
-- Existing scoped grants were always resolved to "a subtree", so DEPT/DIVISION both map to NODE.
UPDATE "permission_group_caps" SET "scope" = 'NODE' WHERE "scope" IN ('DEPT', 'DIVISION');
