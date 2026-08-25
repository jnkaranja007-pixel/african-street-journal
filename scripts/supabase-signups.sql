create table if not exists public.asj_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  watchlist jsonb not null default '[]'::jsonb,
  preferred_audience text not null default 'general',
  source text not null default 'my_africa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.asj_signups enable row level security;

drop policy if exists "public can join asj desk" on public.asj_signups;
create policy "public can join asj desk"
on public.asj_signups
for insert
to anon
with check (
  email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  and jsonb_typeof(watchlist) = 'array'
  and jsonb_array_length(watchlist) between 1 and 55
  and preferred_audience in ('general', 'farmers', 'investors', 'diaspora')
);
