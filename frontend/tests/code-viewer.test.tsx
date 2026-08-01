import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CodeViewer, languageFromPath } from '@/app/components/code-viewer'
import { ModeSelector } from '@/app/components/mode-selector'

describe('languageFromPath', () => {
  it.each([
    ['app/main.py', 'python'],
    ['app/page.tsx', 'tsx'],
    ['lib/api.ts', 'typescript'],
    ['server/main.go', 'go'],
    ['src/lib.rs', 'rust'],
    ['Program.cs', 'csharp'],
    ['script.SH', 'bash'],
  ])('maps %s to %s', (path, expected) => {
    expect(languageFromPath(path)).toBe(expected)
  })

  it('falls back to plain text for unknown and extensionless files', () => {
    expect(languageFromPath('data.bin')).toBe('text')
    expect(languageFromPath('Makefile')).toBe('text')
  })
})

describe('CodeViewer', () => {
  it('prompts for a file when nothing is selected', () => {
    render(<CodeViewer content="" isLoading={false} onClose={vi.fn()} />)

    expect(screen.getByText(/Select a file from the explorer/)).toBeInTheDocument()
  })

  it('shows the path and the file body', () => {
    render(
      <CodeViewer
        path="C:/repo/auth.py"
        content="def authenticate(): ..."
        isLoading={false}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByTitle('C:/repo/auth.py')).toBeInTheDocument()
    expect(screen.getByText(/authenticate/)).toBeInTheDocument()
  })

  it('shows a loading state instead of stale content', () => {
    render(<CodeViewer path="C:/repo/auth.py" content="" isLoading onClose={vi.fn()} />)

    expect(screen.getByText('Loading file...')).toBeInTheDocument()
  })

  it('reports a read error as an alert', () => {
    render(
      <CodeViewer
        path="C:/repo/gone.py"
        content=""
        isLoading={false}
        error="Path not found"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Path not found')
  })

  it('closes on request', async () => {
    const onClose = vi.fn()
    render(<CodeViewer path="C:/repo/auth.py" content="x" isLoading={false} onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close file' }))

    expect(onClose).toHaveBeenCalled()
  })
})

describe('ModeSelector', () => {
  it('marks the active mode', () => {
    render(<ModeSelector value="regex" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Regex' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'RAG' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports a mode change', async () => {
    const onChange = vi.fn()
    render(<ModeSelector value="rag" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Fuzzy' }))

    expect(onChange).toHaveBeenCalledWith('fuzzy')
  })

  it('cannot be changed while a request is running', async () => {
    const onChange = vi.fn()
    render(<ModeSelector value="rag" onChange={onChange} disabled />)

    await userEvent.click(screen.getByRole('button', { name: 'Fuzzy' }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
