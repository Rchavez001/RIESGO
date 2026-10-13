import React from 'react'
import { safeHttpUrl } from './safeUrl'

// get-consent-notice returns `rendered_md`: the published aviso with its markers already resolved
// (_shared/consent-render.ts), using only the Markdown subset the seed aviso actually needs — headings
// (`#`..`######`), **bold**, "- " lists, "---" rules and [text](url) links. Rendered straight to React
// elements, never through `dangerouslySetInnerHTML`: there is no HTML string produced, so there is
// nothing to sanitize against injection — unsafe link targets are the only thing filtered (safeHttpUrl).
//
// `skipHeading` drops a single top-level (`#`) heading whose text matches the document's own `title`
// (RegisterScreen already renders that as its own <h2>, straight from `notice.title`) so it isn't shown twice.
export function renderConsentMarkdown(markdown: string, skipHeading?: string): React.ReactNode {
  const skipNormalized = skipHeading?.trim().toLowerCase()
  const blocks = markdown.trim().split(/\n\s*\n/).filter(Boolean)

  return blocks.map((block, index) => {
    const lines = block.split('\n')
    const headingMatch = lines.length === 1 ? lines[0].match(/^(#{1,6})\s+(.*)$/) : null

    if (headingMatch) {
      const [, hashes, text] = headingMatch
      if (skipNormalized && text.trim().toLowerCase() === skipNormalized) return null
      const level = Math.min(6, hashes.length + 2)
      return React.createElement(`h${level}`, { key: index }, renderInline(text))
    }

    if (/^-{3,}$/.test(block.trim())) {
      return <hr key={index} />
    }

    if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
      return (
        <ul key={index}>
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>{renderInline(line.trim().replace(/^[-*]\s+/, ''))}</li>
          ))}
        </ul>
      )
    }

    return (
      <p key={index}>
        {lines.map((line, lineIndex) => (
          <React.Fragment key={lineIndex}>
            {renderInline(line)}
            {lineIndex < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>
    )
  })
}

const INLINE_PATTERN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null

  INLINE_PATTERN.lastIndex = 0
  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    if (match[1] !== undefined) {
      nodes.push(<strong key={key++}>{match[1]}</strong>)
    } else {
      const href = safeHttpUrl(match[3])
      nodes.push(href
        ? <a key={key++} href={href} target="_blank" rel="noreferrer">{match[2]}</a>
        : match[2])
    }
    lastIndex = INLINE_PATTERN.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
