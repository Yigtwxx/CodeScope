"use client"

import { Search, FileText, Hash } from "lucide-react"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

// Arama sonucu veri yapısı
interface SearchResult {
    file: string
    line_number: number
    line_content: string
    context_before: string[]
    context_after: string[]
}

interface SearchResultsProps {
    results: SearchResult[]
    total: number
    query: string
    searchType: 'regex' | 'fuzzy'
    onFileClick?: (file: string, lineNumber: number) => void
}

export function SearchResults({ results, total, query, searchType, onFileClick }: SearchResultsProps) {
    // Sonuç yok ise boş durum göster
    if (results.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-white/40 space-y-4 p-8">
                <Search className="h-16 w-16 opacity-30" />
                <div className="text-center space-y-2">
                    <p className="text-lg font-medium text-white/60">No results found</p>
                    {query && (
                        <p className="text-sm font-mono text-white/40 bg-white/5 px-3 py-1 rounded">
                            &quot;{query}&quot;
                        </p>
                    )}
                    <div className="text-sm text-white/50 space-y-1 mt-4">
                        <p className="font-medium">Try:</p>
                        {searchType === 'regex' ? (
                            <ul className="text-xs text-white/40 space-y-1">
                                <li>• Simpler patterns: <code className="bg-white/5 px-1 rounded">function</code></li>
                                <li>• Different syntax: <code className="bg-white/5 px-1 rounded">class.*</code></li>
                                <li>• Check file types are supported</li>
                            </ul>
                        ) : (
                            <ul className="text-xs text-white/40 space-y-1">
                                <li>• Different search terms</li>
                                <li>• Lower threshold in settings</li>
                                <li>• Try regex mode instead</li>
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Sonuçlar Başlığı */}
            <div className="px-4 py-3 border-b border-white/10 bg-[#0a0a0a]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-medium">
                            Found <span className="text-blue-400 font-bold">{total}</span> {total === 1 ? 'match' : 'matches'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/50">
                        <Hash className="h-3 w-3" />
                        <span className="font-mono">{searchType}</span>
                    </div>
                </div>
                <div className="mt-1 text-xs text-white/40 font-mono truncate">
                    Query: &quot;{query}&quot;
                </div>
            </div>

            {/* Sonuç Listesi */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                    {results.map((result, index) => (
                        <Card
                            key={`${result.file}-${result.line_number}-${index}`}
                            className="bg-[#0f0f0f] border-white/10 hover:border-blue-500/50 transition-all cursor-pointer group overflow-hidden"
                            onClick={() => onFileClick?.(result.file, result.line_number)}
                        >
                            <div className="p-4">
                                {/* Dosya Yolu ve Satır Numarası */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <FileText className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                        <span className="text-sm font-mono text-white/80 truncate">
                                            {result.file}
                                        </span>
                                    </div>
                                    <div className="flex-shrink-0 ml-2 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-mono">
                                        L{result.line_number}
                                    </div>
                                </div>

                                {/* Kod Bağlamı (öncesi, o satır, sonrası) */}
                                <div className="space-y-1 font-mono text-xs">
                                    {/* Context Before */}
                                    {result.context_before.map((line, i) => (
                                        <div key={`before-${i}`} className="text-white/30 pl-2 border-l-2 border-white/5">
                                            {line || '\u00A0'}
                                        </div>
                                    ))}

                                    {/* Matched Line */}
                                    <div className="bg-blue-500/10 text-blue-100 pl-2 border-l-2 border-blue-500 py-1 group-hover:bg-blue-500/20 transition-colors">
                                        {result.line_content || '\u00A0'}
                                    </div>

                                    {/* Context After */}
                                    {result.context_after.map((line, i) => (
                                        <div key={`after-${i}`} className="text-white/30 pl-2 border-l-2 border-white/5">
                                            {line || '\u00A0'}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}


