"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface SettingsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onIngestSuccess: (path: string) => void
}

export function SettingsModal({ open, onOpenChange, onIngestSuccess }: SettingsModalProps) {
    const [repoPath, setRepoPath] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleIngest = async () => {
        if (!repoPath) return
        setIsLoading(true)
        setError(null)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 300000) // 5-minute timeout

        try {
            const sanitizedPath = repoPath.trim().replace(/^['"]+|['"]+$/g, '')
            console.log("Ingesting path:", sanitizedPath)

            const response = await fetch("http://localhost:8000/api/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo_path: sanitizedPath }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                throw new Error(data.detail || `Ingestion failed with status ${response.status}`)
            }

            const data = await response.json()
            // alert(`Repository opened! Indexing started in background.`) // Optional: remove alert for smoother flow
            onIngestSuccess(sanitizedPath)
            onOpenChange(false)
        } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.error("Ingestion error:", err)
            if (err.name === 'AbortError') {
                setError("Ingestion timed out. The repository might be too large. Try a smaller repo or increase the timeout.")
            } else if (err.message.includes("Failed to fetch")) {
                setError("Could not connect to backend. Is it running?")
            } else {
                setError(err.message || "An unexpected error occurred")
            }
        } finally {
            clearTimeout(timeoutId)
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Repository Settings</DialogTitle>
                    <DialogDescription>
                        Enter the absolute path of the local repository you want to chat with.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="path" className="text-right">
                            Path
                        </Label>
                        <Input
                            id="path"
                            value={repoPath}
                            onChange={(e) => setRepoPath(e.target.value)}
                            placeholder="C:/Projects/MyRepo"
                            className="col-span-3"
                        />
                    </div>
                    {error && <p className="text-red-500 text-sm ml-auto">{error}</p>}
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={handleIngest} disabled={isLoading}>
                        {isLoading ? "Opening..." : "Open Repository"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
