"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { ChatMessage } from "./components/chat-message"
import { SettingsModal } from "./components/settings-modal"

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am CodeScope. Set a repository in settings and ask me anything about your code.' }
  ])
  const [input, setInput] = useState("")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return

    const userMessage = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsGenerating(true)

    // Add empty assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: "" }])

    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      })

      if (!response.ok) throw new Error("Chat failed")

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) return

      let accumulatedContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        accumulatedContent += chunk

        setMessages(prev => {
          const newMessages = [...prev]
          const lastMsg = newMessages[newMessages.length - 1]
          if (lastMsg.role === 'assistant') {
            lastMsg.content = accumulatedContent
          }
          return newMessages
        })
      }
    } catch (error) {
      console.error(error)
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, something went wrong." }])
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="flex h-full flex-col bg-transparent p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-tight text-white">CodeScope</h1>
        <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="text-white/70 hover:text-white hover:bg-white/10">
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden bg-black/20 border-white/10 backdrop-blur-sm shadow-inner">
        {/* Replaced ScrollArea with standard div for reliability */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, index) => (
            <ChatMessage key={index} role={msg.role} content={msg.content} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-white/10 bg-white/5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex space-x-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your codebase..."
              disabled={isGenerating}
              className="flex-1 bg-black/40 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/20"
            />
            <Button type="submit" disabled={isGenerating || !input.trim()} className="bg-white text-black hover:bg-white/90">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>

      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        onIngestSuccess={() => { }}
      />
    </main>
  )
}
