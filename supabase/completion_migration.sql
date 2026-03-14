-- Completion-aware items: new enum + columns + relationship value
-- Run this in the Supabase SQL editor

-- 1. New enum for completion mode
create type item_completion_mode as enum ('closes', 'branching', 'generative');

-- 2. New columns on items
alter table items
  add column if not exists completion_mode     item_completion_mode,
  add column if not exists completion_outcome  text,
  add column if not exists follow_up_generated boolean not null default false,
  add column if not exists possible_outcomes   jsonb,   -- string[]
  add column if not exists follow_up_templates jsonb;  -- Record<outcome, string[]>

-- 3. Extend the item_relationship enum
-- ALTER TYPE ADD VALUE cannot run inside a transaction; run it standalone
alter type item_relationship add value if not exists 'spawned_from_completion';
