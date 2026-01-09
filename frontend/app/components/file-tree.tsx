"use client"

import { useState, useEffect } from "react"
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FileNode {
    name: string
    type: "file" | "directory"
    path: string
    children?: FileNode[]
}

interface FileTreeProps {
    rootPath: string
    onSelectFile: (path: string) => void
}

const FileTreeNode = ({ node, level, onSelect }: { node: FileNode, level: number, onSelect: (path: string) => void }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const [children, setChildren] = useState<FileNode[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [hasLoaded, setHasLoaded] = useState(false)

    useEffect(() => {
        if (level === 0 && !hasLoaded) {
            setIsLoading(true)
            setIsExpanded(true)
            fetch("http://localhost:8000/api/files/list", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: node.path })
            })
                .then(res => {
                    if (res.ok) return res.json()
                    throw new Error("Failed to load")
                })
                .then(data => {
                    setChildren(data)
                    setHasLoaded(true)
                })
                .catch(err => console.error("Failed to load files", err))
                .finally(() => setIsLoading(false))
        }
    }, [level, hasLoaded, node])


    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (node.type === 'file') {
            onSelect(node.path)
            return
        }

        if (!isExpanded && !hasLoaded) {
            setIsLoading(true)
            try {
                const response = await fetch("http://localhost:8000/api/files/list", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: node.path })
                })
                if (response.ok) {
                    const data = await response.json()
                    setChildren(data)
                    setHasLoaded(true)
                }
            } catch (error) {
                console.error("Failed to load files", error)
            } finally {
                setIsLoading(false)
            }
        }
        setIsExpanded(!isExpanded)
    }

    return (
        <div className="select-none">
            <div
                className={`flex items-center py-1.5 px-2 cursor-pointer text-sm transition-colors duration-200
                    ${level === 0 ? 'font-medium' : ''}
                    hover:bg-white/10 active:bg-white/20
                    ${node.type === 'directory' ? 'text-blue-300' : 'text-gray-300'}
                `}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                onClick={handleToggle}
            >
                <span className={`mr-2 opacity-70 ${node.type === 'directory' ? 'text-blue-400' : 'text-gray-400'}`}>
                    {node.type === 'directory' ? (
                        isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                    ) : (
                        <File className="h-4 w-4" />
                    )}
                </span>
                <span className="truncate">
                    {node.name}
                </span>
            </div>
            {isExpanded && (
                <div>
                    {isLoading ? (
                        <div className="text-xs text-white/40 pl-8">Loading...</div>
                    ) : (
                        children.map((child) => (
                            <FileTreeNode key={child.path} node={child} level={level + 1} onSelect={onSelect} />
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

export function FileTree({ rootPath, onSelectFile }: FileTreeProps) {
    const [rootNode, setRootNode] = useState<FileNode | null>(null)

    useEffect(() => {
        if (rootPath) {
            // Construct a pseudo-root node to kick off the tree
            setRootNode({
                name: rootPath.split(/[/\\]/).pop() || "Root",
                type: "directory",
                path: rootPath
            })
        }
    }, [rootPath])

    return (
        <div className="h-full flex flex-col">
            <div className="p-3 border-b border-white/10 font-bold text-white/80">Explorer</div>
            <div className="flex-1 overflow-auto p-2">
                {rootNode ? (
                    <FileTreeNode key={rootNode.path} node={rootNode} level={0} onSelect={onSelectFile} />
                ) : (
                    <div className="text-white/40 text-sm p-4 text-center">No repository loaded. Go to Settings.</div>
                )}
            </div>
        </div>
    )
}
