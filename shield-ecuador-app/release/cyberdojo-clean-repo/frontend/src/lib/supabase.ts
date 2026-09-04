import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ---- Tipos básicos ----

export interface UserProfile {
  id: string
  email: string
  phone?: string
  full_name?: string
  business_type?: string
  role: 'user' | 'admin' | 'analyst'
  belt: string
  total_points: number
  current_risk_level?: string
  location_city?: string
  location_province?: string
  onboarding_completed: boolean
  created_at: string
  last_evaluation_at?: string
  data_processing_authorized?: boolean
  data_processing_authorized_at?: string
  privacy_notice_version?: string
}

export interface Kata {
  id: string
  kata_code: string
  name: string
  description?: string
  teaching?: string
  estimated_minutes?: number
  required_belt?: string
  points_reward: number
  steps?: unknown[]
  verification_type: string
}

export interface Alert {
  id: string
  title: string
  description: string
  threat_type: string
  severity: string
  source?: string
  source_url?: string
  related_question_ids?: string[]
  related_incident_id?: string
  source_agent?: string
  published_at: string
}

export interface Evaluation {
  id: string
  user_id: string
  evaluation_date: string
  total_score: number
  risk_level: string
  belt_awarded?: string
  vector_scores?: Record<string, number>
}

export interface AIProvider {
  provider_key: string
  label: string
  provider_type: string
  model_name: string
  purpose?: string
  active: boolean
  created_at: string
}

export interface BusinessSector {
  code: string
  label: string
  active: boolean
  display_order: number
  created_at?: string
  updated_at?: string
}

export interface AgentConfig {
  id: string
  agent_code: 'incident-investigator' | 'question-auditor' | 'ciber-dojo-news-agent' | 'sensei-question-auditor'
  name: string
  description?: string
  enabled: boolean
  trigger_time: string
  timezone: string
  prompt_template: string
  investigation_window_days?: number
  last_run_at?: string
  extra_settings?: Record<string, unknown>
  updated_at?: string
  created_at: string
}

export interface AgentProviderAssignment {
  id: string
  agent_config_id: string
  provider_key: string
  priority: number
  active: boolean
}

export interface IncidentInvestigation {
  id: string
  incident_date: string
  title: string
  summary: string
  severity: 'baja' | 'media' | 'alta' | 'critica'
  source_name?: string
  source_url?: string
  ai_provider_key?: string
  generated_question_ids?: string[]
  status: 'detectado' | 'preguntas_generadas' | 'auditado' | 'descartado'
  created_at: string
}

export interface QuestionRecord {
  id: string
  branch: string
  order_num?: number
  iso_control?: string
  question_text: string
  question_type: string
  options: unknown[]
  active: boolean
  source_type?: string
  generated_from_incident_id?: string
  audit_status?: 'pending' | 'approved' | 'rejected'
  audit_notes?: string
  created_at?: string
}

export interface AgentRun {
  id: string
  agent_config_id?: string
  run_date: string
  started_at: string
  finished_at?: string
  status: 'running' | 'completed' | 'failed'
  summary?: string
  triggered_by?: string
  error_message?: string
}

export interface AIAuditCorrectionReport {
  source_type: 'sensei' | 'web_scanner_question'
  record_id: string
  created_at: string
  reviewed_at: string
  question_text: string
  original_answer_text?: string
  corrected_answer_text?: string
  auditor_provider?: string
  auditor_model?: string
  correction_notes?: string
  auditor_replaced_content: boolean
  status?: string
}
