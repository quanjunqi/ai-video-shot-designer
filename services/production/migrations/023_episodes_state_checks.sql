-- 023: episodes.status / stage 取值归一 + 补 CHECK
--
-- 背景（2026-10-10 审计发现的不一致，共两处）：
--   1) episodes.status 的 DB 默认值是 'draft'，但前端 EpisodeStatus **没有该取值**
--      （apps/web/src/types/index.ts：pending / analyzing / needs_review / in_work / blocked / done）。
--      前端写入的是 'pending'（useEpisodeStore.ts:152、InterpretStage.tsx:250），
--      即「DB 默认值」与「代码实际使用值」不一致，类型与实际数据对不上。
--   2) episodes.stage / status **完全没有 CHECK 约束**，
--      而 episode.Update 会把请求里的 status 直接写库（postgres.go:107），
--      意味着任意字符串（含拼写错误）都能落库。
--
-- 归一方向选择「把 DB 对齐到代码」而不是「给前端加 draft」：
--   代码（Go + TS）已统一使用 'pending'，改 DB 默认值只需动一处，
--   且无需改动前端类型、UI 分支与 mock 数据，变更面最小。
--
-- 本文件可重复执行（迁移执行器无版本跟踪）：
--   UPDATE 条件幂等；先 DROP IF EXISTS 再 ADD；DO 块只读校验。

-- 1) 把历史上由 DB 默认值产生的 'draft' 归一为 'pending'
UPDATE episodes SET status = 'pending' WHERE status = 'draft';

-- 2) 默认值对齐代码
ALTER TABLE episodes ALTER COLUMN status SET DEFAULT 'pending';

-- 3) 加约束前先做可读的前置校验：
--    若存在未预期取值，给出**可操作的错误信息**，而不是让 CHECK 抛出难以定位的
--    "violates check constraint"。这里刻意**不静默改写**未知取值 —— 那会掩盖真实数据问题。
DO $$
DECLARE
    bad_status text;
    bad_stage  text;
BEGIN
    SELECT string_agg(DISTINCT status, ', ') INTO bad_status
      FROM episodes
     WHERE status IS NOT NULL
       AND status NOT IN ('pending', 'analyzing', 'needs_review', 'in_work', 'blocked', 'done');

    IF bad_status IS NOT NULL THEN
        RAISE EXCEPTION 'episodes.status 存在未预期取值: %。请先归一为 pending/analyzing/needs_review/in_work/blocked/done 之一后重跑本迁移。', bad_status;
    END IF;

    SELECT string_agg(DISTINCT stage, ', ') INTO bad_stage
      FROM episodes
     WHERE stage IS NOT NULL
       AND stage NOT IN ('analyze', 'characters', 'props', 'scenes', 'directing', 'units', 'production', 'done');

    IF bad_stage IS NOT NULL THEN
        RAISE EXCEPTION 'episodes.stage 存在未预期取值: %。请先归一为 analyze/characters/props/scenes/directing/units/production/done 之一后重跑本迁移。', bad_stage;
    END IF;
END $$;

-- 4) 落约束（取值集合与 apps/web/src/types/index.ts 的 EpisodeStatus / EpisodeStage 一一对应）
ALTER TABLE episodes DROP CONSTRAINT IF EXISTS episodes_status_check;
ALTER TABLE episodes ADD CONSTRAINT episodes_status_check
    CHECK (status IN ('pending', 'analyzing', 'needs_review', 'in_work', 'blocked', 'done'));

ALTER TABLE episodes DROP CONSTRAINT IF EXISTS episodes_stage_check;
ALTER TABLE episodes ADD CONSTRAINT episodes_stage_check
    CHECK (stage IN ('analyze', 'characters', 'props', 'scenes', 'directing', 'units', 'production', 'done'));
