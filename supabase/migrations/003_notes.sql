-- Team notes (internal, never sent) + a personal note Arjun wants woven into the email.
-- Safe to run more than once. Also includes 002 in case it wasn't run.
alter table settings add column if not exists min_invite_score numeric not null default 50;

create table if not exists candidate_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  author text not null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists candidate_notes_candidate_idx on candidate_notes(candidate_id);
alter table candidate_notes enable row level security;

alter table candidates add column if not exists email_note text;
