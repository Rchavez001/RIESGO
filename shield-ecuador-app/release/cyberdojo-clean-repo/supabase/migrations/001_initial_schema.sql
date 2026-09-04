-- supabase/migrations/001_initial_schema.sql

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- TABLA: users
-- ========================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  full_name TEXT,
  business_type TEXT CHECK (business_type IN (
    'pescador', 'agricultor', 'comerciante',
    'restaurante', 'ferreteria', 'farmacia', 'otro'
  )),
  belt TEXT DEFAULT 'white' CHECK (belt IN (
    'white', 'yellow', 'orange', 'green', 'brown', 'black'
  )),
  total_points INT DEFAULT 0,
  current_risk_level TEXT CHECK (current_risk_level IN (
    'bajo', 'medio', 'alto', 'critico'
  )),
  location_city TEXT,
  location_province TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_evaluation_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT FALSE
);

-- ========================================
-- TABLA: evaluations
-- ========================================
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  evaluation_date TIMESTAMPTZ DEFAULT NOW(),
  total_score INT NOT NULL,
  risk_level TEXT NOT NULL,
  belt_awarded TEXT,
  vector_scores JSONB,
  responses JSONB NOT NULL,
  prompt_version TEXT,
  ai_used TEXT,
  ai_response_time_ms INT,
  completed BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_evaluations_user ON evaluations(user_id);
CREATE INDEX idx_evaluations_date ON evaluations(evaluation_date DESC);

-- ========================================
-- TABLA: questions
-- ========================================
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  branch TEXT NOT NULL,
  order_num INT,
  iso_control TEXT,
  question_text TEXT NOT NULL,
  question_type TEXT CHECK (question_type IN (
    'unica_opcion', 'multiple_opcion', 'escenario'
  )),
  options JSONB NOT NULL,
  conditional_logic JSONB,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_questions_branch ON questions(branch);

-- ========================================
-- TABLA: katas
-- ========================================
CREATE TABLE katas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kata_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  teaching TEXT,
  estimated_minutes INT,
  required_belt TEXT,
  points_reward INT DEFAULT 100,
  steps JSONB,
  verification_type TEXT CHECK (verification_type IN (
    'manual', 'automatic', 'self_report'
  )),
  active BOOLEAN DEFAULT TRUE
);

-- ========================================
-- TABLA: kata_completions
-- ========================================
CREATE TABLE kata_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  kata_id UUID REFERENCES katas(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  verification_data JSONB,
  points_earned INT,
  UNIQUE(user_id, kata_id)
);

CREATE INDEX idx_kata_completions_user ON kata_completions(user_id);

-- ========================================
-- TABLA: email_analysis
-- ========================================
CREATE TABLE email_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  sender_domain TEXT,
  sender_display_name TEXT,
  spf_pass BOOLEAN,
  dkim_pass BOOLEAN,
  dmarc_pass BOOLEAN,
  typosquatting_detected BOOLEAN DEFAULT FALSE,
  urls_count INT DEFAULT 0,
  malicious_urls_count INT DEFAULT 0,
  verdict TEXT CHECK (verdict IN ('seguro', 'sospechoso', 'peligroso')),
  threat_type TEXT,
  confidence_score DECIMAL(3,2)
);

CREATE INDEX idx_email_analysis_user ON email_analysis(user_id);
CREATE INDEX idx_email_analysis_verdict ON email_analysis(verdict);

-- ========================================
-- TABLA: domains_whitelist
-- ========================================
CREATE TABLE domains_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name TEXT NOT NULL,
  domains TEXT[] NOT NULL,
  entity_type TEXT CHECK (entity_type IN (
    'banco', 'gobierno', 'proveedor', 'otro'
  )),
  active BOOLEAN DEFAULT TRUE,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- TABLA: alerts
-- ========================================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  threat_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('baja', 'media', 'alta', 'critica')),
  source TEXT,
  source_url TEXT,
  target_business_types TEXT[],
  target_banks TEXT[],
  published_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_alerts_active ON alerts(active);
CREATE INDEX idx_alerts_severity ON alerts(severity);

-- ========================================
-- TABLA: alert_deliveries
-- ========================================
CREATE TABLE alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  action_taken TEXT,
  UNIQUE(alert_id, user_id)
);

-- ========================================
-- TABLA: sponsors
-- ========================================
CREATE TABLE sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  sponsor_type TEXT CHECK (sponsor_type IN (
    'banco', 'antivirus', 'tecnico', 'aseguradora', 'otro'
  )),
  coverage_provinces TEXT[],
  services JSONB,
  subscription_tier TEXT,
  monthly_fee DECIMAL(10,2),
  matching_rules JSONB,
  active BOOLEAN DEFAULT TRUE,
  contact_email TEXT,
  contact_phone TEXT
);

-- ========================================
-- TABLA: ai_configs
-- ========================================
CREATE TABLE ai_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_name TEXT UNIQUE NOT NULL,
  primary_ai TEXT NOT NULL,
  primary_timeout_ms INT DEFAULT 8000,
  fallback_ai TEXT,
  fallback_timeout_ms INT DEFAULT 5000,
  tertiary_ai TEXT,
  temperature DECIMAL(3,2) DEFAULT 0.10,
  max_tokens INT DEFAULT 500,
  prompt_version TEXT,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- TABLA: recommendations_cache
-- ========================================
CREATE TABLE recommendations_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT UNIQUE NOT NULL,
  risk_profile JSONB NOT NULL,
  recommendation_text TEXT NOT NULL,
  ai_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  hit_count INT DEFAULT 0,
  last_hit_at TIMESTAMPTZ
);

CREATE INDEX idx_recommendations_hash ON recommendations_cache(query_hash);

-- ========================================
-- TRIGGERS: Updated At
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_configs_updated_at BEFORE UPDATE ON ai_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
