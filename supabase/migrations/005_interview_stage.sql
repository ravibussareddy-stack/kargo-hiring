-- Interview tracking for invited candidates: invited (default) -> wip -> dropped.
alter table candidates add column if not exists interview_stage text check (interview_stage in ('invited', 'wip', 'dropped'));
alter table candidates add column if not exists interview_stage_at timestamptz;
alter table candidates add column if not exists drop_reason text;
