"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

interface SettingsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onIngestSuccess: (path: string) => void
}

export function SettingsModal({ open, onOpenChange, onIngestSuccess }: SettingsModalProps) {
    const [repoPath, setRepoPath] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [progressMessages, setProgressMessages] = useState<string[]>([])

    const handleIngest = async () => {
        if (!repoPath) return
        setIsLoading(true)
        setError(null)
        setProgressMessages([])

        try {
            // Dosya yolunu temizle (tırnak işaretlerini kaldır)
            const sanitizedPath = repoPath.trim().replace(/^['"]+|['"]+$/g, '')
            console.log("Ingesting path:", sanitizedPath)

            const response = await fetch("http://localhost:8000/api/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo_path: sanitizedPath }),
            })

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.detail || `Ingestion failed with status ${response.status}`)
            }

            // Stream yanıtı oku (ilerleme güncellemeleri için)
            const reader = response.body?.getReader()
            const decoder = new TextDecoder()

            if (!reader) {
                throw new Error("No response body")
            }

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const text = decoder.decode(value)
                setProgressMessages(prev => [...prev, text])

                // İçe aktarmanın tamamlanıp tamamlanmadığını kontrol et
                if (text.includes("🎉 INGESTION COMPLETE!")) {
                    // Tarayıcı bildirimi göster (destekleniyorsa)
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("CodeScope", {
                            body: "✅ Repository ingestion completed! Ready to answer questions.",
                            icon: "/favicon.ico"
                        })
                    }
                }
            }

            onIngestSuccess(sanitizedPath)
            setTimeout(() => onOpenChange(false), 1500) // Tamamlanmayı gösterdikten sonra kapat
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.error("Ingestion error:", err)
            if (err.message.includes("Failed to fetch")) {
                setError("Could not connect to backend. Is it running?")
            } else {
                setError(err.message || "An unexpected error occurred")
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <>
            {open && (
                <>
                    {/* Arka Plan Örtüsü (Backdrop) */}
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
                        onClick={() => onOpenChange(false)}
                    />

                    {/* Modal Penceresi */}
                    <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
                        <div className="bg-[#1a1b26] border border-white/20 rounded-xl shadow-2xl w-full max-w-md pointer-events-auto max-h-[90vh] flex flex-col">
                            {/* Başlık (Header) */}
                            <div className="p-6 border-b border-white/10 flex-shrink-0">
                                <h2 className="text-xl font-semibold text-white">Repository Settings</h2>
                                <p className="text-sm text-white/50 mt-1">Open a local repository to analyze</p>
                            </div>

                            {/* İçerik - Kaydırılabilir */}
                            <div className="p-6 flex-1 overflow-y-auto">
                                <form onSubmit={handleIngest} className="space-y-4">
                                    <div>
                                        <label htmlFor="repoPath" className="block text-sm font-medium text-white/70 mb-2">
                                            Repository Path
                                        </label>
                                        <input
                                            id="repoPath"
                                            type="text"
                                            value={repoPath}
                                            onChange={(e) => setRepoPath(e.target.value)}
                                            placeholder="C:\Users\YourName\Projects\my-repo"
                                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-colors"
                                            required
                                        />
                                        <p className="text-xs text-white/40 mt-2">
                                            Enter the full path to your local repository
                                        </p>
                                    </div>

                                    {error && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                                            <p className="text-sm text-red-300">{error}</p>
                                        </div>
                                    )}

                                    {progressMessages.length > 0 && (
                                        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg max-h-60 overflow-y-auto">
                                            <div className="text-sm text-blue-200 font-mono whitespace-pre-wrap">
                                                {progressMessages.join('')}
                                            </div>
                                        </div>
                                    )}
                                </form>
                            </div>

                            {/* Alt Bilgi (Footer) - Sabit */}
                            <div className="p-6 border-t border-white/10 flex gap-3 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => onOpenChange(false)}
                                    className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleIngest}
                                    disabled={isLoading}
                                    className="flex-1 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Opening...
                                        </>
                                    ) : (
                                        'Open Repository'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </>
    )
}


