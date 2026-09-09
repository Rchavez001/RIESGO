import { supabase } from '../lib/supabase'
import catalog from '../data/learningCatalog.json'
import type { BeltLevel } from '../data/ciberDojo'
import '../screens/learning.css'

export const learningDojos = catalog.map(d => ({ ...d, belt: d.belt as BeltLevel }))
export type LearningItem = {
  id: string; prompt: string; options: string[]; correct?: number; explanation?: string
  topic: string; terms: Record<string, string>; sublevel: number
}
export type LearningState = {
  dojo: string; cursor: number; answered: number; total: number; complete: boolean
  question: LearningItem; selected: number | null; version: string
}
export type LearningOverview = { id: string; answered: number; passed: boolean; unlocked: boolean }
export type LearningExam = {
  id: string; dojo: string; belt: BeltLevel; cases: LearningItem[]
  answers: Record<string, number>; finished: boolean; score: number | null; passed: boolean | null
}

export async function learningCall<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    if (error.code === 'P0001') throw new Error(error.message)
    throw new Error('No pudimos guardar o recuperar tu avance. Revisa tu conexión y vuelve a intentar; tus respuestas guardadas se conservan.')
  }
  return data as T
}
