'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, File, Loader2 } from 'lucide-react'
import { listFiles, toErrorMessage, type FileEntry } from '../lib/api'

interface FileTreeProps {
  rootPath: string
  onSelectFile: (path: string) => void
  selectedPath?: string | undefined
}

interface NodeProps {
  entry: FileEntry
  level: number
  onSelect: (path: string) => void
  selectedPath?: string | undefined
  defaultExpanded?: boolean
}

function FileTreeNode({
  entry,
  level,
  onSelect,
  selectedPath,
  defaultExpanded = false,
}: NodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [children, setChildren] = useState<FileEntry[] | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const isDirectory = entry.type === 'directory'
  const isSelected = selectedPath === entry.path

  const loadChildren = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true)
      setError(undefined)
      try {
        setChildren(await listFiles(entry.path, signal))
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(toErrorMessage(caught))
      } finally {
        setIsLoading(false)
      }
    },
    [entry.path]
  )

  // The root node loads immediately; nested folders load when opened.
  useEffect(() => {
    if (!defaultExpanded || !isDirectory) return
    const controller = new AbortController()
    void loadChildren(controller.signal)
    // Cancel the request if the repository changes while it is in flight.
    return () => controller.abort()
  }, [defaultExpanded, isDirectory, loadChildren])

  const handleActivate = () => {
    if (!isDirectory) {
      onSelect(entry.path)
      return
    }
    if (!isExpanded && children === undefined) void loadChildren()
    setIsExpanded((open) => !open)
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleActivate}
        title={entry.name}
        aria-expanded={isDirectory ? isExpanded : undefined}
        className={`flex w-full items-center gap-2 py-1.5 pr-2 text-left text-sm transition-colors ${
          isSelected ? 'bg-white/15 text-white' : 'hover:bg-white/10'
        } ${isDirectory ? 'text-blue-300' : 'text-gray-300'}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        <span className="flex-shrink-0 opacity-70" aria-hidden="true">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isDirectory ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <File className="h-4 w-4" />
          )}
        </span>
        <span className="truncate">{entry.name}</span>
      </button>

      {isExpanded && (
        <div>
          {error && (
            <p
              className="px-2 py-1 text-xs text-red-400"
              style={{ paddingLeft: `${level * 12 + 28}px` }}
            >
              {error}
            </p>
          )}
          {!error && !isLoading && children?.length === 0 && (
            <p
              className="px-2 py-1 text-xs text-white/30"
              style={{ paddingLeft: `${level * 12 + 28}px` }}
            >
              Empty
            </p>
          )}
          {children?.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              level={level + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree({ rootPath, onSelectFile, selectedPath }: FileTreeProps) {
  const rootEntry = useMemo<FileEntry | undefined>(() => {
    if (!rootPath) return undefined
    return {
      name: rootPath.split(/[/\\]/).filter(Boolean).pop() ?? rootPath,
      type: 'directory',
      path: rootPath,
    }
  }, [rootPath])

  return (
    <div className="flex h-full w-full flex-col">
      <nav aria-label="Repository files" className="flex-1 overflow-auto py-2">
        {rootEntry ? (
          // Remounting on path change resets every node's cached children.
          <FileTreeNode
            key={rootEntry.path}
            entry={rootEntry}
            level={0}
            onSelect={onSelectFile}
            selectedPath={selectedPath}
            defaultExpanded
          />
        ) : (
          <p className="p-4 text-center text-sm text-white/40">
            No repository indexed yet. Open settings to add one.
          </p>
        )}
      </nav>
    </div>
  )
}
