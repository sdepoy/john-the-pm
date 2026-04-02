'use client'

import { useRef, useState, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { ProjectPlan } from '@/lib/schemas/project-plan'
import { approvePlan, rejectPlan } from '@/app/actions/projects'

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlanReviewChatProps {
  projectId: string
  threadId: string
  projectName: string
  plan: ProjectPlan | null
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  const textContent = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')

  if (!textContent) return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0 mt-1">
          J
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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

// ─── PlanPanel ────────────────────────────────────────────────────────────────

function PlanPanel({ plan }: { plan: ProjectPlan | null }) {
  if (!plan) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No plan available.
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full p-4 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
        <p className="text-sm text-gray-600 mt-1">{plan.objective}</p>
        {plan.confidence !== undefined && (
          <span className="inline-block mt-2 text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">
            {Math.round(plan.confidence * 100)}% confidence
          </span>
        )}
      </div>

      {/* Milestones */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Milestones
        </h3>
        <div className="space-y-4">
          {plan.milestones.map((milestone, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-gray-900 text-sm">{milestone.title}</h4>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    milestone.status === 'complete'
                      ? 'bg-green-100 text-green-700'
                      : milestone.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700'
                        : milestone.status === 'at_risk'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {milestone.status.replace('_', ' ')}
                </span>
              </div>
              {milestone.targetDate && (
                <p className="text-xs text-gray-500 mt-1">Target: {milestone.targetDate}</p>
              )}
              {milestone.tasks.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {milestone.tasks.map((task, j) => (
                    <li key={j} className="flex items-center gap-2 text-xs text-gray-700">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          task.priority === 'critical'
                            ? 'bg-red-500'
                            : task.priority === 'high'
                              ? 'bg-orange-400'
                              : task.priority === 'medium'
                                ? 'bg-yellow-400'
                                : 'bg-gray-300'
                        }`}
                      />
                      <span>{task.title}</span>
                      <span className="text-gray-400 ml-auto">[{task.priority}]</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Risks */}
      {plan.openRisks && plan.openRisks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Open Risks
          </h3>
          <ul className="space-y-1">
            {plan.openRisks.map((risk, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-2">
                <span className="text-yellow-500 flex-shrink-0">!</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlanReviewChat({
  projectId,
  threadId,
  projectName,
  plan,
}: PlanReviewChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: {
        projectId,
        threadId,
        mode: 'plan-review',
      },
    }),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text || status === 'streaming') return
    sendMessage({ role: 'user', parts: [{ type: 'text', text }] })
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApprove = async () => {
    setIsApproving(true)
    try {
      await approvePlan(projectId)
    } catch {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    setIsRejecting(true)
    try {
      await rejectPlan(projectId)
    } catch {
      setIsRejecting(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left panel: plan viewer */}
      <div className="w-96 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200 bg-white">
          <h1 className="font-semibold text-gray-900 text-sm">{projectName}</h1>
          <p className="text-xs text-gray-500 mt-0.5">Draft Plan</p>
        </div>
        <div className="flex-1 overflow-hidden">
          <PlanPanel plan={plan} />
        </div>
        {/* Action buttons */}
        <div className="p-4 border-t border-gray-200 bg-white space-y-2">
          <button
            onClick={handleApprove}
            disabled={isApproving || isRejecting}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            {isApproving ? 'Approving...' : 'Approve Plan'}
          </button>
          <button
            onClick={handleReject}
            disabled={isApproving || isRejecting}
            className="w-full bg-white hover:bg-gray-50 disabled:text-gray-300 text-gray-700 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            {isRejecting ? 'Returning to discovery...' : 'Back to Discovery'}
          </button>
        </div>
      </div>

      {/* Right panel: chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
            J
          </div>
          <div>
            <p className="font-semibold text-gray-900">John the PM</p>
            <p className="text-xs text-gray-500">Plan Review</p>
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
                Ready to review the plan
              </h2>
              <p className="text-gray-500 max-w-sm text-sm">
                Ask me anything about the plan or request revisions. Once you&apos;re happy, approve it on the left to kick off the project.
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
              placeholder="Ask John about the plan or request changes..."
              disabled={status === 'streaming'}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 max-h-32 overflow-y-auto"
              style={{ minHeight: '48px' }}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || status === 'streaming'}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl px-5 py-3 text-sm font-medium transition-colors flex-shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
