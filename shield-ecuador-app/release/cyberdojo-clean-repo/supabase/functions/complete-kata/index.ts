import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

type ExamStep = {
  correct?: number
}

type KataRecord = {
  id: string
  kata_code: string
  required_belt: string | null
  points_reward: number | null
  steps: ExamStep[] | null
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    const token = authHeader.replace(/^Bearer\s+/i, "")

    if (!token) {
      return jsonResponse({ error: "Missing authorization header" }, 401)
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid session" }, 401)
    }

    const body = await req.json() as { kata_code?: string; selected_answers?: unknown }
    const kataCode = String(body.kata_code ?? "").trim()
    const selectedAnswers = Array.isArray(body.selected_answers)
      ? body.selected_answers.map((item) => Number(item))
      : []

    if (!/^[A-Z0-9_-]{2,80}$/i.test(kataCode)) {
      return jsonResponse({ error: "Invalid kata code" }, 400)
    }

    const { data: kata, error: kataError } = await supabase
      .from("katas")
      .select("id, kata_code, required_belt, points_reward, steps")
      .eq("kata_code", kataCode)
      .eq("active", true)
      .single()

    if (kataError || !kata) {
      return jsonResponse({ error: "Kata not found" }, 404)
    }

    const exam = kata as KataRecord
    const steps = Array.isArray(exam.steps) ? exam.steps : []

    if (steps.length === 0 || selectedAnswers.length !== steps.length) {
      return jsonResponse({ error: "Invalid answer count" }, 400)
    }

    const score = selectedAnswers.reduce((acc, selected, index) => {
      const correct = Number(steps[index]?.correct ?? 0)
      return acc + (selected === correct ? 1 : 0)
    }, 0)

    const total = steps.length
    const passed = total > 0 && score / total >= 0.75
    const pointsEarned = passed ? Number(exam.points_reward ?? 0) : 0
    const userId = authData.user.id

    const { error: completionError } = await supabase.from("kata_completions").upsert({
      user_id: userId,
      kata_id: exam.id,
      points_earned: pointsEarned,
      verification_data: {
        type: "belt_exam",
        score,
        total,
        passed,
        kata_code: exam.kata_code,
        evaluated_server_side: true,
      },
    }, { onConflict: "user_id,kata_id" })

    if (completionError) throw completionError

    const { data: completions, error: pointsError } = await supabase
      .from("kata_completions")
      .select("points_earned")
      .eq("user_id", userId)

    if (pointsError) throw pointsError

    const totalPoints = (completions ?? []).reduce(
      (acc, row) => acc + Number(row.points_earned ?? 0),
      0,
    )

    const updatePayload: Record<string, unknown> = {
      total_points: totalPoints,
    }

    if (passed) {
      updatePayload.belt = getNextBelt(exam.required_belt ?? "white")
    }

    const { error: userUpdateError } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", userId)

    if (userUpdateError) throw userUpdateError

    return jsonResponse({
      kata_code: exam.kata_code,
      score,
      total,
      passed,
      pointsEarned,
      totalPoints,
      belt: updatePayload.belt ?? null,
    })
  } catch (error) {
    console.error("Error in complete-kata:", error)
    return jsonResponse({ error: "Unable to complete kata" }, 500)
  }
})

function getNextBelt(current: string) {
  const path = ["white", "yellow", "orange", "green", "blue", "purple", "red", "black"]
  const index = path.indexOf(current)
  if (index < 0) return "yellow"
  return path[Math.min(index + 1, path.length - 1)]
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
