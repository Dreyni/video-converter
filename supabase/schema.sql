create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('convert', 'transcribe')),
  filename text not null,
  file_size bigint not null check (file_size > 0),
  output_format text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'error')),
  output_url text,
  transcript text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_kind_idx on public.jobs (kind);

create or replace function public.set_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
before update on public.jobs
for each row
execute function public.set_jobs_updated_at();

alter table public.jobs enable row level security;

drop policy if exists "jobs_select_all" on public.jobs;
create policy "jobs_select_all"
on public.jobs
for select
using (true);

drop policy if exists "jobs_insert_all" on public.jobs;
create policy "jobs_insert_all"
on public.jobs
for insert
with check (true);

drop policy if exists "jobs_update_all" on public.jobs;
create policy "jobs_update_all"
on public.jobs
for update
using (true)
with check (true);
