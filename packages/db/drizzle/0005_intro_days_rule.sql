-- The length of an introduction is a rule, not a constant: MATCHING gains `introDays` (7, as the product says), in every version.
UPDATE "rule_sets" SET "params" = "params" || '{"introDays":7}'::jsonb WHERE "domain" = 'MATCHING' AND NOT ("params" ? 'introDays');
