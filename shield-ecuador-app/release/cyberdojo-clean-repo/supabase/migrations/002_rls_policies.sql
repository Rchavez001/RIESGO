-- supabase/migrations/002_rls_policies.sql

-- ========================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ========================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kata_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE katas ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE domains_whitelist ENABLE ROW LEVEL SECURITY;

-- ========================================
-- POLICIES: users
-- ========================================
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ========================================
-- POLICIES: evaluations
-- ========================================
CREATE POLICY "Users can view own evaluations"
  ON evaluations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own evaluations"
  ON evaluations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- POLICIES: kata_completions
-- ========================================
CREATE POLICY "Users can view own kata completions"
  ON kata_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own kata completions"
  ON kata_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- POLICIES: email_analysis
-- ========================================
CREATE POLICY "Users can view own email analysis"
  ON email_analysis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email analysis"
  ON email_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- POLICIES: alerts (PUBLIC - todos leen)
-- ========================================
CREATE POLICY "Users can view active alerts"
  ON alerts FOR SELECT
  USING (active = TRUE);

-- ========================================
-- POLICIES: alert_deliveries
-- ========================================
CREATE POLICY "Users can view own alert deliveries"
  ON alert_deliveries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alert deliveries"
  ON alert_deliveries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- POLICIES: katas (PUBLIC - todos leen)
-- ========================================
CREATE POLICY "Users can view active katas"
  ON katas FOR SELECT
  USING (active = TRUE);

-- ========================================
-- POLICIES: questions (PUBLIC - todos leen)
-- ========================================
CREATE POLICY "Users can view active questions"
  ON questions FOR SELECT
  USING (active = TRUE);

-- ========================================
-- POLICIES: domains_whitelist (PUBLIC)
-- ========================================
CREATE POLICY "Users can view active domains"
  ON domains_whitelist FOR SELECT
  USING (active = TRUE);
