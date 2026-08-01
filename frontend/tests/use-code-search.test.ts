import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCodeSearch } from '@/app/hooks/use-code-search'
import { ApiError, type SearchMatch, type SearchResponse } from '@/app/lib/api'

vi.mock('@/app/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/api')>('@/app/lib/api')
  return { ...actual, searchRegex: vi.fn(), searchFuzzy: vi.fn() }
})

const { searchFuzzy, searchRegex } = await import('@/app/lib/api')
const regexMock = vi.mocked(searchRegex)
const fuzzyMock = vi.mocked(searchFuzzy)

const MATCH: SearchMatch = {
  file: 'src/auth.py',
  absolute_path: 'C:/repo/src/auth.py',
  line_number: 12,
  line_content: 'def authenticate(user):',
  context_before: [],
  context_after: [],
}

function response(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    results: [MATCH],
    total_matches: 1,
    query: 'authenticate',
    search_type: 'regex',
    truncated: false,
    ...overrides,
  }
}

describe('useCodeSearch', () => {
  it('refuses to search before a repository is indexed', async () => {
    const { result } = renderHook(() => useCodeSearch(''))

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.search('authenticate', 'regex')
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe('Index a repository from settings before searching.')
    expect(regexMock).not.toHaveBeenCalled()
  })

  it('runs a regex search and stores the results', async () => {
    regexMock.mockResolvedValue(response())
    const { result } = renderHook(() => useCodeSearch('C:/repo'))

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.search('authenticate', 'regex')
    })

    expect(ok).toBe(true)
    expect(regexMock).toHaveBeenCalledWith('authenticate', 'C:/repo')
    expect(result.current.results).toEqual([MATCH])
    expect(result.current.query).toBe('authenticate')
    expect(result.current.error).toBeUndefined()
  })

  it('routes fuzzy searches to the fuzzy endpoint', async () => {
    fuzzyMock.mockResolvedValue(response({ search_type: 'fuzzy' }))
    const { result } = renderHook(() => useCodeSearch('C:/repo'))

    await act(async () => {
      await result.current.search('authentiction', 'fuzzy')
    })

    expect(fuzzyMock).toHaveBeenCalledWith('authentiction', 'C:/repo')
    expect(regexMock).not.toHaveBeenCalled()
  })

  it('exposes the truncation flag', async () => {
    regexMock.mockResolvedValue(response({ truncated: true }))
    const { result } = renderHook(() => useCodeSearch('C:/repo'))

    await act(async () => {
      await result.current.search('.', 'regex')
    })

    expect(result.current.truncated).toBe(true)
  })

  it('reports a rejected pattern and clears stale results', async () => {
    regexMock.mockResolvedValueOnce(response())
    const { result } = renderHook(() => useCodeSearch('C:/repo'))
    await act(async () => {
      await result.current.search('authenticate', 'regex')
    })

    regexMock.mockRejectedValueOnce(new ApiError('Invalid regular expression', 400))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.search('class(', 'regex')
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe('Invalid regular expression')
    expect(result.current.results).toEqual([])
    expect(result.current.truncated).toBe(false)
  })

  it('reset clears everything', async () => {
    regexMock.mockResolvedValue(response({ truncated: true }))
    const { result } = renderHook(() => useCodeSearch('C:/repo'))
    await act(async () => {
      await result.current.search('authenticate', 'regex')
    })

    act(() => result.current.reset())

    expect(result.current.results).toEqual([])
    expect(result.current.query).toBe('')
    expect(result.current.truncated).toBe(false)
    expect(result.current.error).toBeUndefined()
  })
})
