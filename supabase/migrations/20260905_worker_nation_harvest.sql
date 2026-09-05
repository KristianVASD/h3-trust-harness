-- Allow nation_harvest / place_test engine commands.

alter table public.worker_runs
  drop constraint if exists worker_runs_command_check;

alter table public.worker_runs
  add constraint worker_runs_command_check check (command in (
    'discover',
    'probe',
    'extract',
    'harvest',
    'coverage',
    'search',
    'full_mission',
    'nation_map',
    'nation_harvest',
    'place_test'
  ));
