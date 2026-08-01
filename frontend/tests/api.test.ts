import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  NetworkError,
  listFiles,
  searchRegex,
  streamChat,
  toErrorMessage,
} from '@/app/lib/api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Build a streaming response that emits the given chunks in order. */
function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

async function collect(generator: AsyncGenerator<string>): Promise<string> {
  let out = ''
  for await (const chunk of generator) out += chunk
  return out
}

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns the parsed body on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse([{ name: 'src', type: 'directory', path: '/repo/src' }])
    )

    await expect(listFiles('/repo')).resolves.toEqual([
      { name: 'src', type: 'directory', path: '/repo/src' },
    ])
  })

  it('surfaces the backend detail message as an ApiError', async () => {
    // A Response body can only be read once, so build a fresh one per call.
    vi.mocked(fetch).mockImplementation(async () => jsonResponse({ detail: 'Path not found' }, 400))

    await expect(listFiles('/nope')).rejects.toThrow(ApiError)
    await expect(listFiles('/nope')).rejects.toThrow('Path not found')
  })

  it('flattens FastAPI validation errors into one message', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ detail: [{ msg: 'field required' }, { msg: 'too long' }] }, 422)
    )

    await expect(listFiles('')).rejects.toThrow('field required; too long')
  })

  it('reports a NetworkError when the backend is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(searchRegex('x', '/repo')).rejects.toThrow(NetworkError)
  })

  it('preserves the ApiError status code', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'nope' }, 404))

    await expect(listFiles('/x')).rejects.toMatchObject({ status: 404 })
  })

  it('streams chat chunks in order', async () => {
    vi.mocked(fetch).mockResolvedValue(streamResponse(['Hello ', 'world', '!']))

    await expect(collect(streamChat('hi'))).resolves.toBe('Hello world!')
  })

  it('decodes multi-byte characters split across chunks', async () => {
    // "ş" is two bytes in UTF-8; splitting it must not corrupt the output.
    const bytes = new TextEncoder().encode('çalış')
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 3))
        controller.enqueue(bytes.slice(3))
        controller.close()
      },
    })
    vi.mocked(fetch).mockResolvedValue(new Response(stream, { status: 200 }))

    await expect(collect(streamChat('hi'))).resolves.toBe('çalış')
  })

  it('raises before streaming when the request itself fails', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'boom' }, 500))

    await expect(collect(streamChat('hi'))).rejects.toThrow('boom')
  })
})

describe('toErrorMessage', () => {
  it('unwraps known error types', () => {
    expect(toErrorMessage(new ApiError('bad request', 400))).toBe('bad request')
    expect(toErrorMessage(new NetworkError('offline'))).toBe('offline')
    expect(toErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('falls back for non-error values', () => {
    expect(toErrorMessage('oops')).toBe('An unexpected error occurred.')
  })
})
