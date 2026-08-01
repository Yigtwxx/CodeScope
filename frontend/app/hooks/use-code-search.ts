'use client'

import { useCallback, useState } from 'react'
import { searchFuzzy, searchRegex, toErrorMessage, type SearchMatch } from '../lib/api'

export type KeywordSearchMode = 'regex' | 'fuzzy'

/** Regex and fuzzy search against the indexed repository. */
export function useCodeSearch(repoPath: string) {
  const [results, setResults] = useState<SearchMatch[]>([])
  const [query, setQuery] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  /** Returns true when the search ran; false when it was rejected or failed. */
  const search = useCallback(
    async (nextQuery: string, mode: KeywordSearchMode): Promise<boolean> => {
      if (!repoPath) {
        setError('Index a repository from settings before searching.')
        return false
      }

      setError(undefined)
      setIsSearching(true)
      setQuery(nextQuery)

      try {
        const response =
          mode === 'regex'
            ? await searchRegex(nextQuery, repoPath)
            : await searchFuzzy(nextQuery, repoPath)
        setResults(response.results)
        setTruncated(response.truncated)
        return true
      } catch (caught) {
        setError(toErrorMessage(caught))
        setResults([])
        setTruncated(false)
        return false
      } finally {
        setIsSearching(false)
      }
    },
    [repoPath]
  )

  const reset = useCallback(() => {
    setResults([])
    setQuery('')
    setTruncated(false)
    setError(undefined)
  }, [])

  return { results, query, truncated, isSearching, error, search, reset, setError }
}
