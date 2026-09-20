-- authenticated had table-wide INSERT/UPDATE on sensei_consultations (RLS only checked ownership), so a
-- user could rewrite the Sensei's own answer, status or auditor fields on their row — or insert rows
-- with invented answers — and skew the admin analytics. The ask-sensei Edge Function writes with the
-- service role; the app only ever sets the feedback columns. Grant exactly that.
REVOKE INSERT, UPDATE ON public.sensei_consultations FROM authenticated;
GRANT UPDATE (feedback_helpful, feedback_text, sentiment_label, sentiment_score) ON public.sensei_consultations TO authenticated;
