-- ============================================================
-- Jot Digest - Supabase Database Schema & Migrations
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. inbox_items
-- ============================================================
CREATE TABLE public.inbox_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'share', 'url', 'other')),
  raw_text    TEXT NOT NULL,
  tags        TEXT[] DEFAULT NULL,
  status      TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'archived')),
  url         TEXT DEFAULT NULL,
  url_summary JSONB DEFAULT NULL
);

CREATE INDEX idx_inbox_items_user_id ON public.inbox_items(user_id);
CREATE INDEX idx_inbox_items_created_at ON public.inbox_items(created_at);
CREATE INDEX idx_inbox_items_status ON public.inbox_items(status);

-- Migration: URL support for inbox items
-- Run this if the table already exists:
-- ALTER TABLE public.inbox_items ADD COLUMN IF NOT EXISTS url TEXT DEFAULT NULL;
-- ALTER TABLE public.inbox_items ADD COLUMN IF NOT EXISTS url_summary JSONB DEFAULT NULL;
-- ALTER TABLE public.inbox_items DROP CONSTRAINT IF EXISTS inbox_items_source_check;
-- ALTER TABLE public.inbox_items ADD CONSTRAINT inbox_items_source_check CHECK (source IN ('manual', 'share', 'url', 'other'));

-- ============================================================
-- 2. digest_runs
-- ============================================================
CREATE TABLE public.digest_runs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  range_start    DATE NOT NULL,
  range_end      DATE NOT NULL,
  model_version  TEXT NOT NULL,
  output_json    JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_digest_runs_user_id ON public.digest_runs(user_id);

-- ============================================================
-- 3. proposed_actions
-- ============================================================
CREATE TABLE public.proposed_actions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  digest_run_id  UUID NOT NULL REFERENCES public.digest_runs(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  details        TEXT NOT NULL DEFAULT '',
  confidence     NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  derived_from   UUID[] NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'merged'))
);

CREATE INDEX idx_proposed_actions_digest_run ON public.proposed_actions(digest_run_id);
CREATE INDEX idx_proposed_actions_user_id ON public.proposed_actions(user_id);

-- ============================================================
-- 4. proposed_projects
-- ============================================================
CREATE TABLE public.proposed_projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  digest_run_id   UUID NOT NULL REFERENCES public.digest_runs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  related_actions UUID[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_proposed_projects_digest_run ON public.proposed_projects(digest_run_id);
CREATE INDEX idx_proposed_projects_user_id ON public.proposed_projects(user_id);

-- ============================================================
-- 5. approved_actions
-- ============================================================
CREATE TABLE public.approved_actions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title                  TEXT NOT NULL,
  details                TEXT NOT NULL DEFAULT '',
  priority               TEXT NOT NULL DEFAULT 'med' CHECK (priority IN ('low', 'med', 'high')),
  due_date               DATE DEFAULT NULL,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'snoozed')),
  source_digest_run_id   UUID REFERENCES public.digest_runs(id) ON DELETE SET NULL,
  source_inbox_item_ids  UUID[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_approved_actions_user_id ON public.approved_actions(user_id);
CREATE INDEX idx_approved_actions_status ON public.approved_actions(status);

-- ============================================================
-- Row Level Security (RLS) Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposed_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approved_actions ENABLE ROW LEVEL SECURITY;

-- inbox_items policies
CREATE POLICY "Users can view own inbox items"
  ON public.inbox_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own inbox items"
  ON public.inbox_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own inbox items"
  ON public.inbox_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own inbox items"
  ON public.inbox_items FOR DELETE
  USING (auth.uid() = user_id);

-- digest_runs policies
CREATE POLICY "Users can view own digest runs"
  ON public.digest_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own digest runs"
  ON public.digest_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own digest runs"
  ON public.digest_runs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own digest runs"
  ON public.digest_runs FOR DELETE
  USING (auth.uid() = user_id);

-- proposed_actions policies
CREATE POLICY "Users can view own proposed actions"
  ON public.proposed_actions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proposed actions"
  ON public.proposed_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proposed actions"
  ON public.proposed_actions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own proposed actions"
  ON public.proposed_actions FOR DELETE
  USING (auth.uid() = user_id);

-- proposed_projects policies
CREATE POLICY "Users can view own proposed projects"
  ON public.proposed_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proposed projects"
  ON public.proposed_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proposed projects"
  ON public.proposed_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own proposed projects"
  ON public.proposed_projects FOR DELETE
  USING (auth.uid() = user_id);

-- approved_actions policies
CREATE POLICY "Users can view own approved actions"
  ON public.approved_actions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own approved actions"
  ON public.approved_actions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own approved actions"
  ON public.approved_actions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own approved actions"
  ON public.approved_actions FOR DELETE
  USING (auth.uid() = user_id);
