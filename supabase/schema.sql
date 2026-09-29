-- Kargo hiring dashboard schema. Run once in the Supabase SQL editor.
-- All access goes through server code using the service role key.
-- RLS is enabled with NO policies, so the anon key can read nothing (incl. pii).

create extension if not exists pgcrypto;

create table if not exists rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('PM','SPM')),
  bucket text not null check (bucket in ('requirements','pattern_hard','pattern_soft','trust')),
  key text not null,
  name text not null,
  strong_description text not null,
  weak_description text not null,
  weight numeric not null check (weight >= 0),
  sort_order int not null default 0,
  unique (role, key)
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  applied_role text not null check (applied_role in ('PM','SPM')),
  file_name text not null,
  pii jsonb not null default '{}'::jsonb,        -- {name, email, phone[], urls[], address}
  raw_text text,                                 -- private; only used to re-redact after a manual PII fix
  location_flag text not null default 'unknown', -- mumbai | relocating | other | unknown
  cv_redacted text,
  status text not null default 'processing'
    check (status in ('processing','scored','needs_review','scoring_failed','sent')),
  status_detail text,
  decision text check (decision in ('invite','reject')),
  decision_overridden boolean not null default false,
  sent_at timestamptz,
  resend_message_id text
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  role text not null check (role in ('PM','SPM')),
  criterion_key text not null,
  score int not null check (score between 0 and 5),
  evidence text not null,
  reason text not null,
  unique (candidate_id, role, criterion_key)
);

create table if not exists role_results (
  candidate_id uuid not null references candidates(id) on delete cascade,
  role text not null check (role in ('PM','SPM')),
  total numeric not null,
  requirements_subtotal numeric not null,
  pattern_hard_subtotal numeric not null,
  pattern_soft_subtotal numeric not null,
  trust_subtotal numeric not null,
  soft_borderline_flag boolean not null default false,
  brief text,
  interview_probes jsonb,
  rank int,  -- rank among candidates who APPLIED for this role; null otherwise
  primary key (candidate_id, role)
);

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references candidates(id) on delete cascade,
  type text not null check (type in ('invite','reject')),
  subject text not null,
  body_template text not null,  -- contains [NAME]
  edited_body text,             -- Arjun's inline edit, if any
  status text not null default 'draft' check (status in ('draft','sent','failed')),
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  invite_cutoff int not null default 5 check (invite_cutoff >= 0),
  min_invite_score numeric not null default 50 check (min_invite_score between 0 and 100)
);
insert into settings (id, invite_cutoff) values (1, 5) on conflict (id) do nothing;
-- for databases created before this column existed:
alter table settings add column if not exists min_invite_score numeric not null default 50;

alter table rubric_criteria enable row level security;
alter table candidates enable row level security;
alter table scores enable row level security;
alter table role_results enable row level security;
alter table emails enable row level security;
alter table settings enable row level security;

-- 003: team notes + personal email note
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
