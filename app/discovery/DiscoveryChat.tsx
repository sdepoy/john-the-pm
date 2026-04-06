'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

interface DiscoveryChatProps {
  projectId: string
  threadId: string
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'
  const text = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')
  if (!text) return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-0.5">
          J
        </div>
      )}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
        }`}
      >
        {text}
      </div>
    </div>
  )
}

function GeneratingOverlay() {
  return (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-lg">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 mb-3">
          {['-0.3s', '-0.15s', '0s'].map((d) => (
            <div
              key={d}
              className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-bounce"
              style={{ animationDelay: d }}
            />
          ))}
        </div>
        <p className="text-base font-semibold text-gray-800">Generating your project plan…</p>
        <p className="text-sm text-gray-500 mt-1">This usually takes 10–20 seconds.</p>
      </div>
    </div>
  )
}

export default function DiscoveryChat({ projectId, threadId }: DiscoveryChatProps) {
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState('')
  const router = useRouter()

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { projectId, threadId, mode: 'discovery' },
    }),
  })

  // When stream ends, check if plan generation was triggered
  useEffect(() => {
    if (status !== 'ready') return
    if (isGeneratingPlan) return

    // Check project status — if 'generating', plan generation is in flight
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.status === 'generating') setIsGeneratingPlan(true)
        if (data.status === 'active') router.push('/project')
      })
      .catch(() => {/* ignore */})
  }, [status, projectId, isGeneratingPlan, router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Poll for plan readiness while generating
  useEffect(() => {
    if (!isGeneratingPlan) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`)
        if (res.status === 404) {
          clearInterval(interval)
          router.push('/discovery')
          return
        }
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'active') {
          clearInterval(interval)
          router.push('/project')
        }
      } catch {
        // ignore transient fetch errors, keep polling
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [isGeneratingPlan, projectId, router])

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text || status === 'streaming') return
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] })
    setInputValue('')
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* ── Left nav ───────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col py-5 px-3">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">J</div>
          <span className="font-semibold text-gray-900 text-sm">John the PM</span>
        </div>
        <nav className="flex-1 space-y-0.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Discovery
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 text-sm cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Plan review
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 text-sm cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            Project
          </div>
        </nav>
      </aside>

      {/* ── Center: chat ───────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {isGeneratingPlan && <GeneratingOverlay />}

        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center gap-3 flex-shrink-0">
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">Discovery Interview</h1>
            <p className="text-xs text-gray-400">Tell John what you want to build</p>
          </div>
          {status === 'streaming' && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-indigo-500">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Thinking
            </span>
          )}
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-2xl mx-auto">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-lg font-bold mb-3">J</div>
                <p className="text-gray-700 font-medium">Hi, I'm John — your AI PM.</p>
                <p className="text-gray-400 text-sm mt-1 max-w-sm">Tell me what you want to build and I'll turn it into a project plan.</p>
              </div>
            )}
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
            {error && <p className="text-center text-red-500 text-sm mt-2">Something went wrong. Please try again.</p>}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="max-w-2xl mx-auto flex gap-3 items-end">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={isGeneratingPlan ? 'Generating plan…' : 'Type your message…'}
              disabled={status === 'streaming' || isGeneratingPlan}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || status === 'streaming' || isGeneratingPlan}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors flex-shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      </main>

      {/* ── Right panel ─── */}
      <aside className="w-64 flex-shrink-0 bg-white border-l border-gray-200 hidden xl:flex flex-col py-5 px-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Status</p>
        <div className="text-sm text-gray-500">
          {isGeneratingPlan
            ? <p className="text-indigo-600 font-medium">Generating plan…</p>
            : <p className="text-gray-400 text-xs">Your plan will appear here once generated.</p>
          }
        </div>
      </aside>
    </div>
  )
}
