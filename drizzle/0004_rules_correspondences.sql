-- Custom SQL migration file, put your code below! --
-- Replaces target_phoneme_id/target_group_id/output_phoneme_id with a single
-- ordered correspondences jsonb array. Existing rows are backfilled into a
-- one-pair correspondence list before the old columns are dropped, so no data
-- is lost -- this table has live rows (the public demo language's rules).
ALTER TABLE "rules" ADD COLUMN "correspondences" jsonb;
--> statement-breakpoint
UPDATE "rules" SET "correspondences" = jsonb_build_array(
  jsonb_build_object(
    'from', CASE
      WHEN "target_phoneme_id" IS NOT NULL THEN jsonb_build_object('kind', 'phoneme', 'phonemeId', "target_phoneme_id")
      ELSE jsonb_build_object('kind', 'group', 'groupId', "target_group_id")
    END,
    'to', "output_phoneme_id"
  )
);
--> statement-breakpoint
ALTER TABLE "rules" ALTER COLUMN "correspondences" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules" DROP CONSTRAINT "target_check";
--> statement-breakpoint
ALTER TABLE "rules" DROP COLUMN "target_phoneme_id";
--> statement-breakpoint
ALTER TABLE "rules" DROP COLUMN "target_group_id";
--> statement-breakpoint
ALTER TABLE "rules" DROP COLUMN "output_phoneme_id";
