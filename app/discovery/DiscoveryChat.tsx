'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiscoveryChatProps {
  projectId: string
  threadId: string
}

// ─── Chat bubble component ────────────────────────────────────────────────────

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  const textContent = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')

  if (!textContent && message.parts.every((p) => p.type !== 'text')) {
    // Tool-only messages — skip rendering
    return null
  }

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0 mt-1">
          J
        </div>
      )}
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
        }`}
      >
        {textContent}
      </div>
    </div>
  )
}

// ─── Generating overlay ───────────────────────────────────────────────────────

function GeneratingOverlay() {
  return (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.3s]" />
          <div className="w-3 h-3 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.15s]" />
          <div className="w-3 h-3 rounded-full bg-indigo-600 animate-bounce" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Generating your project plan...
        </h2>
        <p className="text-gray-500 text-sm">
          John is turning your discovery session into a full project plan.
        </p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DiscoveryChat({ projectId, threadId }: DiscoveryChatProps) {
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [inputValue, setInputValue] = useState('')

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: {
        projectId,
        threadId,
        mode: 'discovery',
      },
    }),
  })

  // Detect proposePlanGeneration tool call in messages
  useEffect(() => {
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (
          part.type === 'tool-invocation' &&
          'toolName' in part &&
          part.toolName === 'proposePlanGeneration'
        ) {
          setIsGeneratingPlan(true)
        }
      }
    }
  }, [messages])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text || status === 'streaming') return

    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text }],
    })
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 relative">
      {isGeneratingPlan && <GeneratingOverlay />}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
          J
        </div>
        <div>
          <h1 className="font-semibold text-gray-900">John the PM</h1>
          <p className="text-xs text-gray-500">Discovery Interview</p>
        </div>
        <div className="ml-auto">
          {status === 'streaming' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
              Thinking...
            </span>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl font-bold mb-4">
              J
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Hi, I&apos;m John — your AI PM.
            </h2>
            <p className="text-gray-500 max-w-md">
              I&apos;ll guide you through a structured discovery session to
              understand your project and generate a comprehensive plan. Ready
              when you are.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {error && (
          <div className="text-center text-red-500 text-sm mt-2">
            Something went wrong. Please try again.
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="flex gap-3 items-end max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isGeneratingPlan
                ? 'Plan generation in progress...'
                : 'Type your message... (Enter to send, Shift+Enter for newline)'
            }
            disabled={status === 'streaming' || isGeneratingPlan}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 max-h-32 overflow-y-auto"
            style={{ minHeight: '48px' }}
          />
          <button
            onClick={handleSend}
            disabled={
              !inputValue.trim() ||
              status === 'streaming' ||
              isGeneratingPlan
            }
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors flex-shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
