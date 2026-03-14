-- Enable UUID extension if not already enabled
create extension if not exists "pgcrypto";

-- Enums
create type item_type as enum ('task', 'curiosity', 'content', 'event', 'idea', 'reference', 'catch_all');
create type item_context as enum ('work', 'personal', 'music', 'golf', 'travel', 'creative', 'unknown');
create type item_state as enum ('captured', 'triaged', 'ready', 'in_progress', 'done', 'archived');
create type item_effort as enum ('quick', 'session', 'project');
create type item_horizon as enum ('active', 'later', 'someday');
create type item_source as enum ('manual', 'url', 'share', 'voice', 'screenshot');
create type entity_type as enum ('person', 'place', 'company', 'artist', 'topic', 'brand');
create type next_step_status as enum ('active', 'expired', 'completed', 'dismissed');
create type next_step_type as enum ('action', 'explore', 'consume', 'develop', 'none');
create type item_relationship as enum (
  'related_to', 'duplicate_of', 'part_of_same_project',
  'followup_to', 'same_entity_cluster', 'inspired_by'
);

-- items
create table items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  raw_text            text,
  url                 text,
  item_type           item_type,
  context             item_context not null default 'unknown',
  state               item_state not null default 'captured',
  effort              item_effort,
  horizon             item_horizon,
  curiosity_score     int check (curiosity_score between 1 and 5),
  actionability_score int check (actionability_score between 1 and 5),
  time_sensitivity    int check (time_sensitivity between 1 and 5),
  importance          int check (importance between 1 and 5),
  avoidance_score     int check (avoidance_score between 0 and 10),
  url_summary         jsonb,
  source              item_source not null default 'manual',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- item_enrichments
create table item_enrichments (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete cascade,
  enriched_at   timestamptz not null default now(),
  model_version text,
  raw_output    jsonb
);

-- item_entities
create table item_entities (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete cascade,
  entity_type   entity_type not null,
  entity_value  text not null
);

-- next_steps
create table next_steps (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id) on delete cascade,
  text         text not null,
  generated_at timestamptz not null default now(),
  expires_at   timestamptz,
  status       next_step_status not null default 'active',
  type         next_step_type not null default 'none'
);

-- state_history
create table state_history (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  from_state text,
  to_state   text not null,
  changed_at timestamptz not null default now(),
  changed_by text
);

-- item_links
create table item_links (
  id           uuid primary key default gen_random_uuid(),
  item_a_id    uuid not null references items(id) on delete cascade,
  item_b_id    uuid not null references items(id) on delete cascade,
  relationship item_relationship not null,
  created_by   text,
  constraint no_self_link check (item_a_id <> item_b_id)
);

-- Indexes on items
create index items_user_id_idx  on items (user_id);
create index items_state_idx    on items (state);
create index items_context_idx  on items (context);

-- Indexes on item_id foreign keys
create index item_enrichments_item_id_idx on item_enrichments (item_id);
create index item_entities_item_id_idx    on item_entities (item_id);
create index next_steps_item_id_idx       on next_steps (item_id);
create index state_history_item_id_idx    on state_history (item_id);
create index item_links_item_a_id_idx     on item_links (item_a_id);
create index item_links_item_b_id_idx     on item_links (item_b_id);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_updated_at
  before update on items
  for each row execute function set_updated_at();

-- RLS
alter table items             enable row level security;
alter table item_enrichments  enable row level security;
alter table item_entities     enable row level security;
alter table next_steps        enable row level security;
alter table state_history     enable row level security;
alter table item_links        enable row level security;

-- items: direct user_id column
create policy "items: owner access"
  on items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- child tables: join back to items to check user_id
create policy "item_enrichments: owner access"
  on item_enrichments for all
  using (exists (select 1 from items where items.id = item_id and items.user_id = auth.uid()))
  with check (exists (select 1 from items where items.id = item_id and items.user_id = auth.uid()));

create policy "item_entities: owner access"
  on item_entities for all
  using (exists (select 1 from items where items.id = item_id and items.user_id = auth.uid()))
  with check (exists (select 1 from items where items.id = item_id and items.user_id = auth.uid()));

create policy "next_steps: owner access"
  on next_steps for all
  using (exists (select 1 from items where items.id = item_id and items.user_id = auth.uid()))
  with check (exists (select 1 from items where items.id = item_id and items.user_id = auth.uid()));

create policy "state_history: owner access"
  on state_history for all
  using (exists (select 1 from items where items.id = item_id and items.user_id = auth.uid()))
  with check (exists (select 1 from items where items.id = item_id and items.user_id = auth.uid()));

-- item_links: read if you own either end, write requires owning item_a_id
create policy "item_links: owner access"
  on item_links for all
  using (
    exists (select 1 from items where items.id = item_a_id and items.user_id = auth.uid()) or
    exists (select 1 from items where items.id = item_b_id and items.user_id = auth.uid())
  )
  with check (
    exists (select 1 from items where items.id = item_a_id and items.user_id = auth.uid())
  );
