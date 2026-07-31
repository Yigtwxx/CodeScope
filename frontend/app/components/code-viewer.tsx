'use client'

import { Loader2, X } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '@/components/ui/button'

interface CodeViewerProps {
  path?: string | undefined
  content: string
  isLoading: boolean
  error?: string | undefined
  onClose: () => void
}

const PRISM_LANGUAGES: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
  html: 'markup',
  xml: 'markup',
  css: 'css',
  scss: 'scss',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  md: 'markdown',
}

/** Map a file extension to a Prism language id. */
export function languageFromPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase()
  return (extension && PRISM_LANGUAGES[extension]) || 'text'
}

export function CodeViewer({ path, content, isLoading, error, onClose }: CodeViewerProps) {
  if (!path) {
    return (
      <p className="flex flex-1 select-none items-center justify-center text-white/40">
        Select a file from the explorer to view it
      </p>
    )
  }

  return (
    <>
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="truncate font-mono text-sm" title={path}>
          {path}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-red-500/20 hover:text-red-400"
          onClick={onClose}
          aria-label="Close file"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <p className="flex h-full items-center justify-center gap-2 text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading file...
          </p>
        ) : error ? (
          <p role="alert" className="p-6 text-sm text-red-300">
            {error}
          </p>
        ) : (
          <SyntaxHighlighter
            language={languageFromPath(path)}
            style={vscDarkPlus}
            showLineNumbers
            customStyle={{
              margin: 0,
              borderRadius: 0,
              minHeight: '100%',
              fontSize: '0.8125rem',
              background: 'transparent',
            }}
          >
            {content}
          </SyntaxHighlighter>
        )}
      </div>
    </>
  )
}
