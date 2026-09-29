-- Information-only estimate of AI-written CV text. Never used in scoring or decisions.
alter table candidates add column if not exists ai_signal jsonb;
