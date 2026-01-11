"use client"

import { useState } from 'react'
import { Download, FileText, FileJson, FileType } from 'lucide-react'
import { Conversation } from '../types/conversations'
import { exportAsMarkdown, exportAsJSON, exportAsPDF } from '../lib/export'

interface ExportMenuProps {
    conversation: Conversation | null
}

export function ExportMenu({ conversation }: ExportMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isExporting, setIsExporting] = useState(false)

    if (!conversation || conversation.messages.length === 0) {
        return null
    }

    // Seçilen formatta dışa aktarma işlemini yönet
    const handleExport = async (format: 'markdown' | 'json' | 'pdf') => {
        setIsExporting(true)
        setIsOpen(false)

        try {
            switch (format) {
                case 'markdown':
                    exportAsMarkdown(conversation)
                    break
                case 'json':
                    exportAsJSON(conversation)
                    break
                case 'pdf':
                    await exportAsPDF(conversation)
                    break
            }
        } catch (error) {
            console.error('Export failed:', error)
            alert('Export failed. Please try again.')
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isExporting}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors group relative disabled:opacity-50 cursor-pointer"
                title="Export conversation"
            >
                <Download className={`h-5 w-5 text-white/70 group-hover:text-white ${isExporting ? 'animate-pulse' : ''}`} />
            </button>

            {isOpen && (
                <>
                    {/* Arka Plan Örtüsü (Backdrop) */}
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dışa Aktar Menüsü */}
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1b26] border border-white/20 rounded-lg shadow-xl overflow-hidden z-20">
                        <div className="p-2 border-b border-white/10">
                            <p className="text-xs text-white/50 px-2">Export as...</p>
                        </div>

                        <button
                            onClick={() => handleExport('markdown')}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <FileText className="h-4 w-4 text-blue-400" />
                            <span>Markdown (.md)</span>
                        </button>

                        <button
                            onClick={() => handleExport('json')}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <FileJson className="h-4 w-4 text-green-400" />
                            <span>JSON (.json)</span>
                        </button>

                        <button
                            onClick={() => handleExport('pdf')}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <FileType className="h-4 w-4 text-red-400" />
                            <span>PDF (.pdf)</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

