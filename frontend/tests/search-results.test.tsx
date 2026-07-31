import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SearchResults } from '@/app/components/search-results'
import type { SearchMatch } from '@/app/lib/api'

const MATCH: SearchMatch = {
  file: 'src/auth.py',
  absolute_path: 'C:/repo/src/auth.py',
  line_number: 42,
  line_content: 'def authenticate(user):',
  context_before: ['# credentials'],
  context_after: ['    return True'],
}

function renderResults(overrides: Partial<Parameters<typeof SearchResults>[0]> = {}) {
  const props = {
    results: [MATCH],
    total: 1,
    query: 'authenticate',
    searchType: 'regex' as const,
    onOpenFile: vi.fn(),
    ...overrides,
  }
  render(<SearchResults {...props} />)
  return props
}

describe('SearchResults', () => {
  it('shows a spinner while searching', () => {
    renderResults({ isSearching: true })

    expect(screen.getByRole('status')).toHaveTextContent('Searching...')
  })

  it('prompts for a search before one has been run', () => {
    renderResults({ results: [], query: '' })

    expect(screen.getByText('Run a search to see results')).toBeInTheDocument()
  })

  it('offers regex-specific hints when nothing matched', () => {
    renderResults({ results: [], query: 'class(' })

    expect(screen.getByText('No results found')).toBeInTheDocument()
    expect(screen.getByText(/Escape special characters/)).toBeInTheDocument()
  })

  it('offers fuzzy-specific hints when nothing matched', () => {
    renderResults({ results: [], query: 'authentiction', searchType: 'fuzzy' })

    expect(screen.getByText(/Lower the similarity threshold/)).toBeInTheDocument()
  })

  it('summarises the match count, mode and query', () => {
    renderResults({ total: 32 })

    expect(screen.getByText('32')).toBeInTheDocument()
    expect(screen.getByText('matches')).toBeInTheDocument()
    expect(screen.getByText('regex')).toBeInTheDocument()
    expect(screen.getByText(/^Query:/)).toHaveTextContent('authenticate')
  })

  it('uses the singular for a single match', () => {
    renderResults()

    expect(screen.getByText('match')).toBeInTheDocument()
  })

  it('flags truncated result sets', () => {
    renderResults({ truncated: true })

    expect(screen.getByText('(results truncated)')).toBeInTheDocument()
  })

  it('renders the matched line with its surrounding context', () => {
    renderResults()

    expect(screen.getByText('def authenticate(user):')).toBeInTheDocument()
    expect(screen.getByText('# credentials')).toBeInTheDocument()
    expect(screen.getByText('return True')).toBeInTheDocument()
    expect(screen.getByText('L42')).toBeInTheDocument()
  })

  it('opens the file by ABSOLUTE path, not the display path', async () => {
    const props = renderResults()

    await userEvent.click(screen.getByRole('button'))

    // Regression: passing result.file made every click fail with a 400.
    expect(props.onOpenFile).toHaveBeenCalledWith('C:/repo/src/auth.py')
  })

  it('shows a fuzzy score when the backend supplies one', () => {
    renderResults({
      results: [{ ...MATCH, score: 86.4 }],
      searchType: 'fuzzy',
    })

    expect(screen.getByText('86%')).toBeInTheDocument()
  })

  it('disables the result when there is nowhere to open it', () => {
    render(<SearchResults results={[MATCH]} total={1} query="authenticate" searchType="regex" />)

    expect(screen.getByRole('button')).toBeDisabled()
  })
})
