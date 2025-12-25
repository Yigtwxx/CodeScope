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
    <main className="flex min-h-screen flex-col bg-background p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">CodeScope</h1>
        <Button variant="outline" size="icon" onClick={() => setIsSettingsOpen(true)}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden h-[80vh]">
        <ScrollArea className="flex-1 p-4">
          {messages.map((msg, index) => (
            <ChatMessage key={index} role={msg.role} content={msg.content} />
          ))}
          <div ref={messagesEndRef} />
        </ScrollArea>

        <div className="p-4 border-t bg-card">
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
              className="flex-1"
            />
            <Button type="submit" disabled={isGenerating || !input.trim()}>
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
