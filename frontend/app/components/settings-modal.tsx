"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface SettingsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onIngestSuccess: () => void
}

export function SettingsModal({ open, onOpenChange, onIngestSuccess }: SettingsModalProps) {
    const [repoPath, setRepoPath] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleIngest = async () => {
        if (!repoPath) return
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch("http://localhost:8000/api/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo_path: repoPath }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.detail || "Ingestion failed")
            }

            const data = await response.json()
            alert(`Successfully ingested ${data.files_count} files and ${data.chunks_count} chunks.`)
            onIngestSuccess()
            onOpenChange(false)
        } catch (err: any) {
            setError(err.message)
        } finally {
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
                        {isLoading ? "Ingesting..." : "Ingest Repository"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
