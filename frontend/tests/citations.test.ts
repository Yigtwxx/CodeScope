import { describe, expect, it } from 'vitest'
import { parseAnswer } from '@/app/lib/citations'

const START = '<!--codescope:sources-->'
const END = '<!--/codescope:sources-->'

function block(...rows: string[]): string {
  return `${START}\n${rows.join('\n')}\n${END}\n\n`
}

describe('parseAnswer', () => {
  it('returns the raw text when there is no citation block', () => {
    const result = parseAnswer('Just an answer.')

    expect(result.sources).toEqual([])
    expect(result.content).toBe('Just an answer.')
  })

  it('extracts citations and strips the block from the prose', () => {
    const raw = `${block('1|auth.py|python|src/auth.py|C:\\repo\\src\\auth.py')}The answer.`

    const result = parseAnswer(raw)

    expect(result.sources).toEqual([
      {
        id: '1',
        filename: 'auth.py',
        language: 'python',
        path: 'src/auth.py',
        absolutePath: 'C:\\repo\\src\\auth.py',
      },
    ])
    expect(result.content).toBe('The answer.')
    expect(result.content).not.toContain(START)
  })

  it('parses several citations in order', () => {
    const raw = block(
      '1|a.py|python|src/a.py|/repo/src/a.py',
      '2|b.ts|typescript|src/b.ts|/repo/src/b.ts'
    )

    const { sources } = parseAnswer(raw)

    expect(sources.map((source) => source.filename)).toEqual(['a.py', 'b.ts'])
  })

  it('hides a half-streamed block instead of leaking the marker', () => {
    const raw = `${START}\n1|a.py|python|src/a.py|/repo/src/a.py`

    const result = parseAnswer(raw)

    expect(result.sources).toEqual([])
    expect(result.content).not.toContain(START)
  })

  it('skips malformed rows rather than rendering broken citations', () => {
    const raw = block('not-a-row', '1|a.py|python|src/a.py|/repo/src/a.py', '||||')

    const { sources } = parseAnswer(raw)

    expect(sources).toHaveLength(1)
    expect(sources[0]?.filename).toBe('a.py')
  })

  it('falls back to unknown when the language field is empty', () => {
    const { sources } = parseAnswer(block('1|notes.txt||docs/notes.txt|/repo/docs/notes.txt'))

    expect(sources[0]?.language).toBe('unknown')
  })

  it('tolerates rows saved before absolute paths were emitted', () => {
    const { sources } = parseAnswer(block('1|a.py|python|src/a.py'))

    expect(sources[0]?.absolutePath).toBe('')
  })

  it('keeps prose that precedes the block and normalises the seam', () => {
    const raw = `Intro.\n${block('1|a.py|python|src/a.py|/repo/a.py')}Body.`

    expect(parseAnswer(raw).content).toBe('Intro.\n\nBody.')
  })

  it('does not leave leading blank lines when the block comes first', () => {
    const raw = `${block('1|a.py|python|src/a.py|/repo/a.py')}Body.`

    expect(parseAnswer(raw).content).toBe('Body.')
  })
})
