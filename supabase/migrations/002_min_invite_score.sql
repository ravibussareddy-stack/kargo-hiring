-- Invite rule becomes: top N for the applied role AND total >= min_invite_score.
alter table settings add column if not exists min_invite_score numeric not null default 50
  check (min_invite_score between 0 and 100);
