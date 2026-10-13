import React from 'react'
import { render, screen } from '@testing-library/react'
import { renderConsentMarkdown } from './consentMarkdown'

function renderMd(markdown: string, skipHeading?: string) {
  render(<div>{renderConsentMarkdown(markdown, skipHeading)}</div>)
}

test('headings render as heading elements, never as raw "#" text', () => {
  renderMd('## 1. ¿Quién es responsable?\n\nTexto del párrafo.')
  expect(screen.getByRole('heading', { name: '1. ¿Quién es responsable?' })).toBeInTheDocument()
  expect(screen.queryByText(/#/)).not.toBeInTheDocument()
})

test('a leading heading matching the document title is dropped (already shown as the screen h2)', () => {
  renderMd('# Consentimiento informado\n\nCuerpo.', 'Consentimiento informado')
  expect(screen.queryByText('Consentimiento informado')).not.toBeInTheDocument()
  expect(screen.getByText('Cuerpo.')).toBeInTheDocument()
})

test('**bold** renders as <strong>, never as literal asterisks', () => {
  renderMd('**CiberDojo**\nVersión 1.0')
  expect(screen.getByText('CiberDojo').tagName).toBe('STRONG')
  expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
})

test('"- " lines become a real list', () => {
  renderMd('- Primer punto\n- **Segundo** punto')
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText('Segundo').tagName).toBe('STRONG')
})

test('"---" becomes a horizontal rule', () => {
  renderMd('Antes.\n\n---\n\nDespués.')
  expect(screen.getByRole('separator')).toBeInTheDocument()
})

test('a safe http(s) link renders as a real, clickable anchor', () => {
  renderMd('Lee la [Política de Privacidad completa](https://example.test/politica) antes de decidir.')
  const link = screen.getByRole('link', { name: 'Política de Privacidad completa' })
  expect(link).toHaveAttribute('href', 'https://example.test/politica')
  expect(link).toHaveAttribute('target', '_blank')
})

test('an unsafe link target (e.g. javascript:) is never rendered as a clickable anchor', () => {
  renderMd('Click [aquí](javascript:evil) para continuar.')
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(screen.getByText(/aquí/)).toBeInTheDocument()
})
