'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRef, useEffect, useState } from 'react'
import type { UIMessage } from 'ai'

interface ChatViewProps {
  projectId: string
  threadId: string
  projectName: string
  initialMessages: UIMessage[]
  hasSummary: boolean
  userName: string
}

export default function ChatView({
  projectId,
  threadId,
  projectName,
  initialMessages,
  hasSummary,
  userName,
}: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [inputText, setInputText] = useState('')

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { projectId, threadId, mode: 'member-chat' },
    }),
    messages: initialMessages,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!inputText.trim()) return
    sendMessage({ text: inputText })
    setInputText('')
  }

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{projectName}</h1>
          <p className="text-sm text-gray-500">Chat with John · {userName}</p>
        </div>
        <a href="/project" className="text-sm text-blue-600 hover:underline">
          Project view →
        </a>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-3xl mx-auto w-full">
        {hasSummary && messages.length > 0 && (
          <div className="text-xs text-center text-gray-400 py-2 border-t border-b border-dashed border-gray-200">
            Earlier conversation summarized
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-16">
            <p className="text-lg font-medium">Hi, I&apos;m John.</p>
            <p className="text-sm mt-1">Tell me what you&apos;re working on today.</p>
          </div>
        )}

        {messages.map((message) => {
          const text = message.parts
            ?.filter((p) => p.type === 'text')
            .map((p) => (p as { type: 'text'; text: string }).text)
            .join('') ?? ''

          if (!text) return null

          const isUser = message.role === 'user'
          return (
            <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{text}</pre>
              </div>
            </div>
          )
        })}

        {status === 'streaming' && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400 shadow-sm">
              John is typing…
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-red-500 text-sm py-2">
            Something went wrong. Please try again.
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Message John…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={status === 'streaming' || !inputText.trim()}
            className="bg-blue-600 text-white rounded-xl px-5 py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
