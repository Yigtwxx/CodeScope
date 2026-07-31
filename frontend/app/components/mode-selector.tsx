'use client'

import { Code, Sparkles, Zap } from 'lucide-react'
import type { SearchMode } from '../lib/api'

interface ModeSelectorProps {
  value: SearchMode
  onChange: (mode: SearchMode) => void
  disabled?: boolean
}

const MODES: {
  id: SearchMode
  label: string
  hint: string
  icon: typeof Sparkles
  active: string
}[] = [
  {
    id: 'rag',
    label: 'RAG',
    hint: 'Ask a question in natural language',
    icon: Sparkles,
    active: 'border-purple-500/40 bg-purple-500/20 text-purple-300',
  },
  {
    id: 'regex',
    label: 'Regex',
    hint: 'Match an exact pattern',
    icon: Code,
    active: 'border-blue-500/40 bg-blue-500/20 text-blue-300',
  },
  {
    id: 'fuzzy',
    label: 'Fuzzy',
    hint: 'Typo-tolerant keyword search',
    icon: Zap,
    active: 'border-orange-500/40 bg-orange-500/20 text-orange-300',
  },
]

const IDLE_STYLE = 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'

export function ModeSelector({ value, onChange, disabled = false }: ModeSelectorProps) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Search mode">
      <span className="mr-1 text-xs text-white/40">Mode</span>
      {MODES.map(({ id, label, hint, icon: Icon, active }) => {
        const isActive = value === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            disabled={disabled}
            title={hint}
            aria-pressed={isActive}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isActive ? active : IDLE_STYLE
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
