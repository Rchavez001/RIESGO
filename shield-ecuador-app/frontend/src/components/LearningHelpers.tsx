import React from 'react'
import type { LearningItem } from '../services/learning'
import { DoggoNote } from './DojoCompanion'

export function LearningTerms({ item }: { item: LearningItem }) {
  const terms = Object.entries(item.terms || {})
  if (!terms.length) return null
  return <details className="learning-terms">
    <summary>Palabras que te pueden ayudar</summary>
    <dl>{terms.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>
  </details>
}

export function LearningFeedback({ item, selected }: { item: LearningItem; selected: number }) {
  const correct = selected === item.correct
  const recommended = item.correct === undefined ? '' : item.options[item.correct]
  const explanation = !correct && recommended && item.explanation?.startsWith(recommended)
    ? item.explanation.slice(recommended.length).trim() : item.explanation
  return <div className={`combat-feedback ${correct ? 'success' : ''}`} role="status">
    <DoggoNote>{correct ? 'Bien hecho. Esta decisión te ayuda a protegerte.' : 'Vamos paso a paso. Aquí puedes practicar sin riesgo.'}</DoggoNote>
    {!correct && item.correct !== undefined && <p>Respuesta recomendada: {item.options[item.correct]}</p>}
    {explanation && <p>{explanation}</p>}
  </div>
}
