"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";

interface ChatPanelProps {
  projectId: string;
  threadId: string;
  initialMessages: UIMessage[];
  userName: string;
  onClose: () => void;
}

export default function ChatPanel({
  projectId,
  threadId,
  initialMessages,
  userName,
  onClose,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState("");

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { projectId, threadId, mode: "member-chat" },
    }),
    messages: initialMessages,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendMessage({ text: inputText });
    setInputText("");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <p className="text-sm font-semibold text-gray-900">Chat with John</p>
          <p className="text-xs text-gray-400">{userName}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-12">
            <p className="text-sm font-medium">Hi, I&apos;m John.</p>
            <p className="text-xs mt-1">Tell me what you&apos;re working on.</p>
          </div>
        )}

        {messages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i).map((message) => {
          const text =
            message.parts
              ?.filter((p) => p.type === "text")
              .map((p) => (p as { type: "text"; text: string }).text)
              .join("") ?? "";
          if (!text) return null;
          const isUser = message.role === "user";
          return (
            <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  isUser
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm"
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{text}</pre>
              </div>
            </div>
          );
        })}

        {status === "streaming" && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1">
                {["-0.3s", "-0.15s", "0s"].map((d) => (
                  <div
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                    style={{ animationDelay: d }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-red-500 text-xs">Something went wrong. Try again.</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Message John…"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={status === "streaming" || !inputText.trim()}
            className="bg-indigo-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1 transition-colors flex-shrink-0"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
