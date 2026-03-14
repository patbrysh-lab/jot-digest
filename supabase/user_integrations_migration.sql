-- user_integrations: one row per user per OAuth provider
create table user_integrations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  provider         text not null,         -- 'google_calendar'
  access_token     text not null,
  refresh_token    text,
  token_expires_at timestamptz,
  scope            text,
  connected_email  text,                  -- which Google account is linked
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, provider)
);

-- reuse the set_updated_at() function created in new_migration.sql
create trigger user_integrations_updated_at
  before update on user_integrations
  for each row execute function set_updated_at();

alter table user_integrations enable row level security;

create policy "user_integrations: owner access"
  on user_integrations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
