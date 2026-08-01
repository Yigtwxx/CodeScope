/**
 * Typed client for the CodeScope backend.
 *
 * Every network call lives here so the base URL, error handling and response
 * shapes are defined once instead of being duplicated across components.
 */

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  ''
)

export type SearchMode = 'rag' | 'regex' | 'fuzzy'

export interface SearchMatch {
  file: string
  absolute_path: string
  line_number: number
  line_content: string
  context_before: string[]
  context_after: string[]
  score?: number | undefined
}

export interface SearchResponse {
  results: SearchMatch[]
  total_matches: number
  query: string
  search_type: 'regex' | 'fuzzy'
  truncated: boolean
  threshold?: number | undefined
}

export interface FileEntry {
  name: string
  type: 'file' | 'directory'
  path: string
}

export interface FileContent {
  content: string
  path: string
  size_bytes: number
  truncated: boolean
}

export interface HealthStatus {
  status: string
  service: string
  version: string
  indexed_chunks: number
  embedding_device: string
}

/** An HTTP-level failure carrying the backend's `detail` message. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Thrown when the backend cannot be reached at all. */
export class NetworkError extends Error {
  constructor(message = 'Could not reach the CodeScope backend. Is it running?') {
    super(message)
    this.name = 'NetworkError'
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string') return detail
      // FastAPI validation errors arrive as a list of issue objects.
      if (Array.isArray(detail)) {
        return detail
          .map((issue) =>
            issue && typeof issue === 'object' && 'msg' in issue
              ? String((issue as { msg: unknown }).msg)
              : JSON.stringify(issue)
          )
          .join('; ')
      }
    }
  } catch {
    // Body was not JSON; fall through to the status text.
  }
  return response.statusText || `Request failed with status ${response.status}`
}

async function request(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new NetworkError()
  }

  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status)
  }
  return response
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await request(path, body, signal)
  return (await response.json()) as T
}

/**
 * Consume a streaming text response line by line.
 *
 * The backend streams plain UTF-8 text; a streaming decoder is required so a
 * multi-byte character split across two network packets is not corrupted.
 */
async function* streamText(response: Response, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new NetworkError('The server returned an empty response body.')

  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal?.aborted) break
      yield decoder.decode(value, { stream: true })
    }
    const tail = decoder.decode()
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/health`, signal ? { signal } : {}).catch(() => {
    throw new NetworkError()
  })
  if (!response.ok) throw new ApiError(await readErrorDetail(response), response.status)
  return (await response.json()) as HealthStatus
}

/** Stream a grounded answer for `message`. */
export async function* streamChat(message: string, signal?: AbortSignal): AsyncGenerator<string> {
  const response = await request('/api/chat', { message }, signal)
  yield* streamText(response, signal)
}

/** Index a repository, streaming progress lines as they arrive. */
export async function* streamIngest(
  repoPath: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const response = await request('/api/ingest', { repo_path: repoPath }, signal)
  yield* streamText(response, signal)
}

export function searchRegex(
  query: string,
  repoPath: string,
  signal?: AbortSignal
): Promise<SearchResponse> {
  return postJson<SearchResponse>('/api/search/regex', { query, repo_path: repoPath }, signal)
}

export function searchFuzzy(
  query: string,
  repoPath: string,
  threshold = 70,
  signal?: AbortSignal
): Promise<SearchResponse> {
  return postJson<SearchResponse>(
    '/api/search/fuzzy',
    { query, repo_path: repoPath, threshold },
    signal
  )
}

export function listFiles(path: string, signal?: AbortSignal): Promise<FileEntry[]> {
  return postJson<FileEntry[]>('/api/files/list', { path }, signal)
}

export function readFile(path: string, signal?: AbortSignal): Promise<FileContent> {
  return postJson<FileContent>('/api/files/content', { path }, signal)
}

/** Normalise any thrown value into a message safe to show a user. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}
