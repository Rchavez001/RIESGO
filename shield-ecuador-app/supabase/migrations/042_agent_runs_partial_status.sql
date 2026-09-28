-- Phase 5: quiz-generator persists status='partial' when the AI provider
-- responded (not an infra/timeout failure) but its output failed schema
-- validation — distinct from 'failed' (no usable response at all) so a
-- human reviewing agent_runs can tell "the AI said something, just not in
-- the right shape" from "nothing came back".

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;

ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check CHECK (status IN (
  'running',
  'completed',
  'failed',
  'partial'
));
