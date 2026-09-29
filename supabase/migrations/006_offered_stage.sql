-- Adds 'offered' as an end state of the interview workflow.
alter table candidates drop constraint if exists candidates_interview_stage_check;
alter table candidates add constraint candidates_interview_stage_check check (interview_stage in ('invited', 'wip', 'offered', 'dropped'));
