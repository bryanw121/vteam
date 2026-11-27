-- vteam beta only (uifolvbwtrbcmfrvelnl). NEVER run on live.
-- Beta is a free Nano server that only serves CI. Live's every-minute and every-10-minute timers
-- (about 1,900 job runs a day) kept its memory commitment over the limit, so new connections
-- failed and CI's drift check timed out (Nov 26 2026). Beta runs the same jobs, less often.
-- The drift check ignores cron schedules (migration 20261126120000), and job health allows
-- the longer gaps on beta (betaMaxAgeMs in scripts/job-health.mjs). Run it again after any
-- migration that reschedules one of these jobs on beta.
select cron.alter_job(jobid, schedule := s.schedule)
from cron.job j
join (values
  ('sample-app-online', '*/30 * * * *'),
  ('new-game-alerts',   '5 * * * *'),
  ('event-reminders',   '35 * * * *'),
  ('award-event-points','7 * * * *'),
  ('prune-rate-limits', '41 */6 * * *')
) as s(jobname, schedule) using (jobname);
