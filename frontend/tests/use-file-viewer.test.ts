import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFileViewer } from '@/app/hooks/use-file-viewer'
import { ApiError, type FileContent } from '@/app/lib/api'

vi.mock('@/app/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/api')>('@/app/lib/api')
  return { ...actual, readFile: vi.fn() }
})

const { readFile } = await import('@/app/lib/api')
const readFileMock = vi.mocked(readFile)

function file(content: string): FileContent {
  return { content, path: 'C:/repo/auth.py', size_bytes: content.length, truncated: false }
}

describe('useFileViewer', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useFileViewer())

    expect(result.current.path).toBeUndefined()
    expect(result.current.content).toBe('')
    expect(result.current.isLoading).toBe(false)
  })

  it('loads a file and exposes its contents', async () => {
    readFileMock.mockResolvedValue(file('def authenticate(): ...'))
    const { result } = renderHook(() => useFileViewer())

    await act(() => result.current.open('C:/repo/auth.py'))

    expect(result.current.path).toBe('C:/repo/auth.py')
    expect(result.current.content).toBe('def authenticate(): ...')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeUndefined()
  })

  it('surfaces a read failure without clearing the selected path', async () => {
    readFileMock.mockRejectedValue(new ApiError('Path not found', 400))
    const { result } = renderHook(() => useFileViewer())

    await act(() => result.current.open('C:/repo/gone.py'))

    expect(result.current.error).toBe('Path not found')
    expect(result.current.path).toBe('C:/repo/gone.py')
    expect(result.current.content).toBe('')
  })

  it('clears the previous error when another file opens', async () => {
    readFileMock.mockRejectedValueOnce(new ApiError('Path not found', 400))
    const { result } = renderHook(() => useFileViewer())
    await act(() => result.current.open('C:/repo/gone.py'))

    readFileMock.mockResolvedValueOnce(file('ok'))
    await act(() => result.current.open('C:/repo/auth.py'))

    expect(result.current.error).toBeUndefined()
    expect(result.current.content).toBe('ok')
  })

  it('close() empties the viewer', async () => {
    readFileMock.mockResolvedValue(file('body'))
    const { result } = renderHook(() => useFileViewer())
    await act(() => result.current.open('C:/repo/auth.py'))

    act(() => result.current.close())

    expect(result.current.path).toBeUndefined()
    expect(result.current.content).toBe('')
  })

  it('aborts an in-flight read when a second file is opened', async () => {
    const signals: (AbortSignal | undefined)[] = []
    readFileMock.mockImplementation(async (_path, signal) => {
      signals.push(signal)
      return file('body')
    })
    const { result } = renderHook(() => useFileViewer())

    await act(() => result.current.open('C:/repo/first.py'))
    await act(() => result.current.open('C:/repo/second.py'))

    // The first request is cancelled so a slow read cannot overwrite the second.
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    expect(result.current.path).toBe('C:/repo/second.py')
  })
})
