/**
 * Parses the citation block the backend prepends to every RAG answer.
 *
 * The block is delimited by HTML comments so it never renders if parsing is
 * skipped, and each row is pipe-separated:
 *
 *   <!--codescope:sources-->
 *   1|auth.py|python|src/auth.py|C:\repo\src\auth.py
 *   <!--/codescope:sources-->
 *
 * Keep this in sync with `SOURCES_START` / `SOURCES_END` in
 * `backend/app/services/rag.py`.
 */

export interface SourceCitation {
  id: string
  filename: string
  language: string
  /** Path relative to the repository root; this is what the UI displays. */
  path: string
  /** Absolute path, used to open the file in the code viewer. */
  absolutePath: string
}

export interface ParsedAnswer {
  sources: SourceCitation[]
  content: string
}

const START_MARKER = '<!--codescope:sources-->'
const END_MARKER = '<!--/codescope:sources-->'

/**
 * Split a streamed answer into its citations and its prose.
 *
 * Answers are parsed while still streaming, so a block whose opening marker has
 * arrived but whose closing marker has not is treated as "not ready yet" and
 * hidden rather than rendered as raw text.
 */
export function parseAnswer(raw: string): ParsedAnswer {
  const start = raw.indexOf(START_MARKER)
  if (start === -1) {
    return { sources: [], content: raw }
  }

  const end = raw.indexOf(END_MARKER, start)
  if (end === -1) {
    // Still streaming the block; show only what precedes it.
    return { sources: [], content: raw.slice(0, start) }
  }

  const block = raw.slice(start + START_MARKER.length, end)

  // Removing the block leaves stray newlines on both sides of the seam; join
  // the remaining halves with a single paragraph break instead.
  const head = raw.slice(0, start).trimEnd()
  const tail = raw.slice(end + END_MARKER.length).trimStart()
  const content = head && tail ? `${head}\n\n${tail}` : head || tail

  return { sources: parseBlock(block), content }
}

function parseBlock(block: string): SourceCitation[] {
  const sources: SourceCitation[] = []

  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const fields = trimmed.split('|')
    // A well-formed row has at least id, filename, language and a path.
    if (fields.length < 4) continue

    const [id, filename, language, path, absolutePath] = fields
    if (!id || !filename || !path) continue

    sources.push({
      id,
      filename,
      language: language || 'unknown',
      path,
      // Older answers replayed from storage may predate this field.
      absolutePath: absolutePath || '',
    })
  }

  return sources
}
