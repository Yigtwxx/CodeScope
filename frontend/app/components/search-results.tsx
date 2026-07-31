'use client'

import { FileText, Hash, Loader2, Search } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SearchMatch } from '../lib/api'

interface SearchResultsProps {
  results: SearchMatch[]
  total: number
  query: string
  searchType: 'regex' | 'fuzzy'
  truncated?: boolean
  isSearching?: boolean
  /** Receives the absolute path so the viewer can open the file. */
  onOpenFile?: (absolutePath: string) => void
}

function EmptyState({ query, searchType }: { query: string; searchType: 'regex' | 'fuzzy' }) {
  const hints =
    searchType === 'regex'
      ? [
          'Try a simpler pattern such as function',
          'Escape special characters like ( and [',
          'Check that the file type is supported',
        ]
      : [
          'Try different keywords',
          'Lower the similarity threshold',
          'Switch to regex mode for exact matches',
        ]

  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-white/40">
      <Search className="h-16 w-16 opacity-30" aria-hidden="true" />
      <div className="space-y-2 text-center">
        <p className="text-lg font-medium text-white/60">
          {query ? 'No results found' : 'Run a search to see results'}
        </p>
        {query && (
          <p className="rounded bg-white/5 px-3 py-1 font-mono text-sm text-white/40">
            &quot;{query}&quot;
          </p>
        )}
        {query && (
          <ul className="mt-4 space-y-1 text-xs text-white/40">
            {hints.map((hint) => (
              <li key={hint}>• {hint}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function SearchResults({
  results,
  total,
  query,
  searchType,
  truncated = false,
  isSearching = false,
  onOpenFile,
}: SearchResultsProps) {
  if (isSearching) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 text-white/50"
        role="status"
      >
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <p className="text-sm">Searching...</p>
      </div>
    )
  }

  if (results.length === 0) {
    return <EmptyState query={query} searchType={searchType} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 bg-[#0a0a0a] px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <span>
              <span className="font-bold text-blue-400">{total}</span>{' '}
              {total === 1 ? 'match' : 'matches'}
            </span>
          </p>
          <span className="flex items-center gap-2 text-xs text-white/50">
            <Hash className="h-3 w-3" aria-hidden="true" />
            <span className="font-mono">{searchType}</span>
          </span>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-white/40">
          Query: &quot;{query}&quot;
          {truncated && <span className="ml-2 text-amber-400">(results truncated)</span>}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <ul className="space-y-3 p-4">
          {results.map((result, index) => (
            <li key={`${result.absolute_path}:${result.line_number}:${index}`}>
              <button
                type="button"
                // The API returns a relative path for display and an absolute
                // one for opening; using the relative path here used to make
                // every result click fail.
                onClick={() => onOpenFile?.(result.absolute_path)}
                disabled={!onOpenFile}
                className="group w-full overflow-hidden rounded-lg border border-white/10 bg-[#0f0f0f] p-4 text-left transition-all enabled:cursor-pointer enabled:hover:border-blue-500/50 disabled:cursor-default"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <FileText className="h-4 w-4 flex-shrink-0 text-blue-400" aria-hidden="true" />
                    <span className="truncate font-mono text-sm text-white/80">{result.file}</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    {typeof result.score === 'number' && (
                      <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white/60">
                        {Math.round(result.score)}%
                      </span>
                    )}
                    <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-xs text-blue-400">
                      L{result.line_number}
                    </span>
                  </span>
                </div>

                <div className="space-y-1 font-mono text-xs">
                  {result.context_before.map((line, i) => (
                    <p key={`before-${i}`} className="border-l-2 border-white/5 pl-2 text-white/30">
                      {line || ' '}
                    </p>
                  ))}
                  <p className="border-l-2 border-blue-500 bg-blue-500/10 py-1 pl-2 text-blue-100 transition-colors group-enabled:group-hover:bg-blue-500/20">
                    {result.line_content || ' '}
                  </p>
                  {result.context_after.map((line, i) => (
                    <p key={`after-${i}`} className="border-l-2 border-white/5 pl-2 text-white/30">
                      {line || ' '}
                    </p>
                  ))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}
