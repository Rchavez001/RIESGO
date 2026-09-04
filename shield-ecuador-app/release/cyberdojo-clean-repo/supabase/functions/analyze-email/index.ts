// supabase/functions/analyze-email/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailData {
  sender_email: string
  sender_display_name?: string
  subject?: string
  body_text?: string
  headers?: Record<string, string>
  urls?: string[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verificar usuario
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const emailData: EmailData = await req.json()

    if (!emailData.sender_email) {
      return new Response(
        JSON.stringify({ error: 'sender_email is required' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Extraer dominio del remitente
    const senderDomain = emailData.sender_email.split('@')[1]?.toLowerCase() ?? ''

    // 1. Verificar contra whitelist de dominios conocidos
    const { data: whitelist } = await supabase
      .from('domains_whitelist')
      .select('entity_name, domains, entity_type')
      .eq('active', true)

    const isWhitelisted = whitelist?.some(entry =>
      entry.domains.some((d: string) => d.toLowerCase() === senderDomain)
    ) ?? false

    // 2. Detectar typosquatting (dominio parecido a uno oficial)
    const typosquattingDetected = !isWhitelisted && detectTyposquatting(
      senderDomain,
      whitelist?.flatMap(e => e.domains) ?? []
    )

    // 3. Verificar headers SPF/DKIM/DMARC si están disponibles
    const spfPass = emailData.headers?.['x-spf-status']?.toLowerCase() === 'pass' ?? null
    const dkimPass = emailData.headers?.['x-dkim-status']?.toLowerCase() === 'pass' ?? null
    const dmarcPass = emailData.headers?.['x-dmarc-status']?.toLowerCase() === 'pass' ?? null

    // 4. Analizar URLs
    const urls = emailData.urls ?? []
    const urlsCount = urls.length
    let maliciousUrlsCount = 0

    for (const url of urls) {
      if (isSuspiciousUrl(url, whitelist?.flatMap(e => e.domains) ?? [])) {
        maliciousUrlsCount++
      }
    }

    // 5. Calcular veredicto
    let threatScore = 0
    if (typosquattingDetected) threatScore += 40
    if (!spfPass && spfPass !== null) threatScore += 20
    if (!dkimPass && dkimPass !== null) threatScore += 15
    if (!dmarcPass && dmarcPass !== null) threatScore += 15
    if (maliciousUrlsCount > 0) threatScore += maliciousUrlsCount * 15
    if (containsPhishingKeywords(emailData.subject ?? '', emailData.body_text ?? '')) threatScore += 25

    let verdict: 'seguro' | 'sospechoso' | 'peligroso'
    let threatType: string | null = null

    if (threatScore >= 60) {
      verdict = 'peligroso'
      threatType = typosquattingDetected ? 'typosquatting' : 'phishing'
    } else if (threatScore >= 25) {
      verdict = 'sospechoso'
      threatType = 'posible_phishing'
    } else {
      verdict = 'seguro'
    }

    const confidenceScore = Math.min(threatScore / 100, 1.0)

    // 6. Guardar análisis en DB
    const { data: analysis, error: saveError } = await supabase
      .from('email_analysis')
      .insert({
        user_id: user.id,
        sender_domain: senderDomain,
        sender_display_name: emailData.sender_display_name,
        spf_pass: spfPass,
        dkim_pass: dkimPass,
        dmarc_pass: dmarcPass,
        typosquatting_detected: typosquattingDetected,
        urls_count: urlsCount,
        malicious_urls_count: maliciousUrlsCount,
        verdict,
        threat_type: threatType,
        confidence_score: confidenceScore
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving analysis:', saveError)
    }

    return new Response(
      JSON.stringify({
        analysis_id: analysis?.id,
        verdict,
        threat_type: threatType,
        confidence_score: confidenceScore,
        details: {
          sender_domain: senderDomain,
          is_whitelisted: isWhitelisted,
          typosquatting_detected: typosquattingDetected,
          spf_pass: spfPass,
          dkim_pass: dkimPass,
          dmarc_pass: dmarcPass,
          urls_count: urlsCount,
          malicious_urls_count: maliciousUrlsCount,
        },
        recommendation: getRecommendation(verdict, typosquattingDetected)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error('Error in analyze-email:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

function detectTyposquatting(domain: string, knownDomains: string[]): boolean {
  for (const known of knownDomains) {
    if (domain === known) return false
    const distance = levenshteinDistance(domain, known)
    if (distance > 0 && distance <= 3) return true
  }
  return false
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i])
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

function isSuspiciousUrl(url: string, whitelistedDomains: string[]): boolean {
  try {
    const parsed = new URL(url)
    const urlDomain = parsed.hostname.toLowerCase()
    if (whitelistedDomains.includes(urlDomain)) return false
    return detectTyposquatting(urlDomain, whitelistedDomains)
  } catch {
    return true // URL malformada = sospechosa
  }
}

function containsPhishingKeywords(subject: string, body: string): boolean {
  const keywords = [
    'verificar cuenta', 'cuenta suspendida', 'actualizar datos',
    'haga clic aquí', 'urgente', 'ganó', 'premio', 'contraseña expirada',
    'confirme su identidad', 'acceso bloqueado', 'verify your account',
    'suspended account', 'click here immediately'
  ]
  const text = `${subject} ${body}`.toLowerCase()
  return keywords.some(kw => text.includes(kw))
}

function getRecommendation(verdict: string, typosquatting: boolean): string {
  if (verdict === 'peligroso') {
    if (typosquatting) {
      return 'Este correo imita un dominio oficial. NO haga clic en ningún link. Elimínelo inmediatamente y reporte a su banco si es necesario.'
    }
    return 'Correo muy peligroso detectado. NO responda ni haga clic en links. Elimínelo inmediatamente.'
  }
  if (verdict === 'sospechoso') {
    return 'Este correo tiene señales de alerta. Si no lo esperaba, no haga clic en links. Verifique llamando directamente a la empresa.'
  }
  return 'Este correo parece seguro. Siempre tenga precaución con links y archivos adjuntos.'
}
