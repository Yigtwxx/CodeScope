import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportAsJSON, exportAsMarkdown } from '@/app/lib/export'
import type { Conversation } from '@/app/types/conversations'

const CONVERSATION: Conversation = {
  id: 'a',
  title: 'Auth flow / notes',
  messages: [
    { role: 'user', content: 'how does login work', timestamp: 1 },
    { role: 'assistant', content: 'It is handled in `auth.py`.', timestamp: 2 },
  ],
  createdAt: 1,
  updatedAt: 2,
  repoPath: 'C:/repo',
}

interface Download {
  content: string
  mimeType: string
  filename: string
}

/**
 * Intercept the download without touching the filesystem.
 *
 * jsdom implements neither `URL.createObjectURL` nor `Blob.text()`, so the
 * payload is captured from the Blob constructor instead.
 */
function captureDownload(): Download {
  const captured: Download = { content: '', mimeType: '', filename: '' }

  vi.stubGlobal(
    'Blob',
    class extends globalThis.Blob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options)
        captured.content = parts.join('')
        captured.mimeType = options?.type ?? ''
      }
    }
  )
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => undefined,
  })

  const createElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = createElement(tag)
    if (tag === 'a') {
      vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(() => {
        captured.filename = (element as HTMLAnchorElement).download
      })
    }
    return element
  })

  return captured
}

describe('exportAsMarkdown', () => {
  let download: Download

  beforeEach(() => {
    download = captureDownload()
  })

  it('labels turns without emoji', () => {
    exportAsMarkdown(CONVERSATION)

    expect(download.content).toContain('## User')
    expect(download.content).toContain('## Assistant')
    expect(download.content).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('includes the title, repository and every message', () => {
    exportAsMarkdown(CONVERSATION)

    expect(download.content).toContain('# Auth flow / notes')
    expect(download.content).toContain('C:/repo')
    expect(download.content).toContain('how does login work')
    expect(download.content).toContain('It is handled in `auth.py`.')
  })

  it('separates messages with a rule but not after the last one', () => {
    exportAsMarkdown(CONVERSATION)

    // One separator after the metadata block, one between the two messages.
    expect(download.content.match(/^---$/gm)).toHaveLength(2)
  })

  it('sanitises the filename and sets the markdown mime type', () => {
    exportAsMarkdown(CONVERSATION)

    expect(download.filename).toBe('Auth_flow_notes.md')
    expect(download.mimeType).toBe('text/markdown')
  })

  it('keeps non-ASCII letters in the filename', () => {
    exportAsMarkdown({ ...CONVERSATION, title: 'app.py nasıl çalışıyor?' })

    expect(download.filename).toBe('app_py_nasıl_çalışıyor.md')
  })

  it('falls back when a title sanitises down to nothing', () => {
    exportAsMarkdown({ ...CONVERSATION, title: '???' })

    expect(download.filename).toBe('conversation.md')
  })
})

describe('exportAsJSON', () => {
  it('round-trips the conversation', () => {
    const download = captureDownload()

    exportAsJSON(CONVERSATION)

    expect(JSON.parse(download.content)).toEqual(CONVERSATION)
    expect(download.filename).toBe('Auth_flow_notes.json')
    expect(download.mimeType).toBe('application/json')
  })
})
