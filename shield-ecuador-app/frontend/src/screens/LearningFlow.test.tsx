import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { supabase } from '../lib/supabase'
import { DojoDetailPage } from './DojoDetailPage'
import { DojoListPage } from './DojoListPage'
import { KataExamPage } from './KataExamPage'

const mockUser = { id: 'learner-1' }
let mockParams: Record<string, string> = { id: 'passwords' }
jest.mock('react-router-dom', () => ({ useParams: () => mockParams, useNavigate: () => jest.fn(), Link: ({children, to}: any) => <a href={to}>{children}</a> }), { virtual: true })
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }))
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, refreshProfile: jest.fn() }) }))
jest.mock('../components/CyberBushido', () => ({
  BeltBadge: ({ level }: any) => <span>{level}</span>,
  NeonButton: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  SectionHeader: ({ title }: any) => <h1>{title}</h1>,
  BeltAwardCelebration: () => <div>Celebración</div>, WARRIOR_IMAGES: ['warrior.jpg'],
}))
const rpc = supabase.rpc as jest.Mock
const question = { id: 'Q-17', prompt: '¿Qué haces con un código que no pediste?', options: ['Lo comparto', 'Lo guardo en secreto', 'Lo publico', 'Lo vendo'], correct: 1,
  explanation: 'Ese código permite entrar a tu cuenta. No se comparte.', terms: {}, topic: 'Códigos de acceso', sublevel: 2 }
const state = { dojo: 'passwords', cursor: 16, answered: 17, total: 30, complete: false, selected: 0, question, version: '3.0.0' }
beforeEach(() => { rpc.mockReset(); mockParams = { id: 'passwords' } })

test('resumes the saved question and its feedback, then persists explicit next', async () => {
  rpc.mockResolvedValueOnce({ data: state }).mockResolvedValueOnce({ data: { ...state, cursor: 17, selected: null } })
  render(<DojoDetailPage />)
  expect(await screen.findByText(/Pregunta 17 de 30/)).toBeInTheDocument()
  expect(screen.getByText(question.explanation)).toBeInTheDocument()
  expect(screen.getByText(/sin riesgo/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Ya leí/ }))
  await waitFor(() => expect(rpc).toHaveBeenCalledWith('learning_next', { p_dojo: 'passwords', p_question: question.id }))
  expect(await screen.findByText(/Pregunta 18 de 30/)).toBeInTheDocument()
})

test('does not claim a failed save is complete and allows a retry', async () => {
  rpc.mockResolvedValueOnce({ data: { ...state, cursor: 29, answered: 29, selected: null } })
    .mockResolvedValueOnce({ error: { code: 'network', message: 'offline' } })
  render(<DojoDetailPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'B. Lo guardo en secreto' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/Revisa tu conexión/)
  expect(screen.queryByText('Completaste las 30 preguntas')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'B. Lo guardo en secreto' })).toBeEnabled()
})

test('opens the exam after 30 answered questions even with a wrong last answer', async () => {
  rpc.mockResolvedValue({ data: { ...state, cursor: 29, answered: 30, complete: true } })
  render(<DojoDetailPage />)
  expect(await screen.findByRole('button', { name: 'Presentar mi examen' })).toBeEnabled()
})

test('exam entry stays disabled at 29 questions and for later belts', async () => {
  rpc.mockResolvedValue({ data: [{ id: 'passwords', answered: 29, unlocked: true, passed: false }] })
  render(<DojoListPage />)
  await screen.findByText('29 de 30 preguntas respondidas')
  screen.getAllByRole('button', { name: 'Kata · 5 casos' }).forEach(button => expect(button).toBeDisabled())
})

test('retains the fifth explanation in the completed exam review', async () => {
  mockParams = { code: 'EXAM_BLANCO_AMARILLO' }
  const cases = Array.from({ length: 5 }, (_, i) => ({ ...question, id: `C-${i}`, explanation: `Explicación del caso ${i + 1}` }))
  rpc.mockResolvedValue({ data: { id: 'attempt', dojo: 'passwords', belt: 'blanco', cases,
    answers: Object.fromEntries(cases.map(q => [q.id, 1])), finished: true, score: 5, passed: true } })
  render(<KataExamPage />)
  expect(await screen.findByText('Explicación del caso 5')).toBeInTheDocument()
  expect(screen.getByText(/Acertaste 5 de 5/)).toBeInTheDocument()
})
