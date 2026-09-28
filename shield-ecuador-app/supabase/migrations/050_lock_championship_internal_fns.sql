-- _championship_time_limit and _championship_question_payload were created
-- without an explicit REVOKE, so Postgres' default (EXECUTE granted to
-- PUBLIC on function creation) left them callable directly by anon/
-- authenticated — harmless today (neither leaks an answer key) but
-- inconsistent with every other internal helper in this schema, which is
-- always explicitly locked to its caller. Closing that gap before it
-- matters, not after.
REVOKE ALL ON FUNCTION public._championship_time_limit(UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._championship_question_payload(UUID, INT) FROM PUBLIC, anon, authenticated;
