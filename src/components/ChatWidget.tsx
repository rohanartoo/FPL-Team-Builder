import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Lock, Bot, User, Trash2, GripHorizontal } from "lucide-react";

interface Message {
  role: "user" | "model";
  content: string;
}

const TOKEN_KEY = "fpl_chat_token";
const TOKEN_EXPIRY_KEY = "fpl_chat_token_expiry";
const HISTORY_KEY = "fpl_chat_history";
const SIZE_KEY = "fpl_chat_size";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORED_MESSAGES = 40;

const DEFAULT_W = 380;
const DEFAULT_H = 560;
const MIN_W = 320;
const MIN_H = 400;
const MAX_W = 760;
const MAX_H = 880;

function getStoredSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (!raw) return { w: DEFAULT_W, h: DEFAULT_H };
    const parsed = JSON.parse(raw);
    return {
      w: Math.min(MAX_W, Math.max(MIN_W, parsed.w ?? DEFAULT_W)),
      h: Math.min(MAX_H, Math.max(MIN_H, parsed.h ?? DEFAULT_H)),
    };
  } catch {
    return { w: DEFAULT_W, h: DEFAULT_H };
  }
}

const STARTER_PROMPTS = [
  "Best value midfielders right now?",
  "Who's injured this week?",
  "Price rises to buy before they happen?",
  "Explain a player's stats — just name them"
];

function getStoredHistory(): Message[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch {}
}

function getStoredToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!token || !expiry) return null;
    if (Date.now() > parseInt(expiry, 10)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + SEVEN_DAYS_MS));
}

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let inTable = false;
  let tableHeaderDone = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Table rows
    if (line.trim().startsWith("|")) {
      // Skip separator rows (|---|---|)
      if (/^\|[\s\-:|]+\|/.test(line.trim())) {
        tableHeaderDone = true;
        continue;
      }
      if (!inTable) {
        output.push('<table class="w-full border-collapse my-1 font-mono text-[10px]">');
        inTable = true;
        tableHeaderDone = false;
      }
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      const tag = !tableHeaderDone ? "th" : "td";
      const cellClass = !tableHeaderDone
        ? 'class="border border-[#141414]/20 px-2 py-1 bg-[#141414]/10 font-bold text-left"'
        : 'class="border border-[#141414]/20 px-2 py-1"';
      output.push(`<tr>${cells.map(c => `<${tag} ${cellClass}>${inlineMarkdown(c)}</${tag}>`).join("")}</tr>`);
      continue;
    } else if (inTable) {
      output.push("</table>");
      inTable = false;
      tableHeaderDone = false;
    }

    // Headings
    if (/^###\s/.test(line)) {
      output.push(`<h3 class="font-serif italic text-sm mt-2 mb-1">${inlineMarkdown(line.replace(/^###\s/, ""))}</h3>`);
      continue;
    }
    if (/^##\s/.test(line)) {
      output.push(`<h2 class="font-serif italic text-sm mt-2 mb-1">${inlineMarkdown(line.replace(/^##\s/, ""))}</h2>`);
      continue;
    }
    if (/^#\s/.test(line)) {
      output.push(`<h2 class="font-serif italic text-sm mt-2 mb-1">${inlineMarkdown(line.replace(/^#\s/, ""))}</h2>`);
      continue;
    }

    // Bullet lists
    if (/^[-*]\s/.test(line)) {
      output.push(`<div class="flex gap-1.5 my-0.5"><span class="opacity-40 shrink-0">•</span><span>${inlineMarkdown(line.replace(/^[-*]\s/, ""))}</span></div>`);
      continue;
    }

    // Numbered lists
    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\.\s/)?.[1];
      output.push(`<div class="flex gap-1.5 my-0.5"><span class="opacity-40 shrink-0 w-4">${num}.</span><span>${inlineMarkdown(line.replace(/^\d+\.\s/, ""))}</span></div>`);
      continue;
    }

    // Empty line → spacing
    if (line.trim() === "") {
      output.push('<div class="h-1"></div>');
      continue;
    }

    output.push(`<p class="my-0.5">${inlineMarkdown(line)}</p>`);
  }

  if (inTable) output.push("</table>");
  return output.join("");
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="bg-[#141414]/10 px-1 rounded font-mono text-[10px]">$1</code>');
}

export interface TeamContext {
  teamName: string;
  budget: number;
  freeTransfers: number;
  overallRank: number | null;
  totalPoints: number;
  squad: Array<{
    name: string;
    team: string;
    position: string;
    price: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    form: string;
    total_points: number;
    chance_of_playing: number | null;
    status: string;
    news: string;
    fdr: number;
  }>;
}

interface ChatWidgetProps {
  teamId?: string | null;
  teamContext?: TeamContext | null;
  currentGW?: number | null;
}

export function ChatWidget({ teamId, teamContext, currentGW }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [messages, setMessages] = useState<Message[]>(getStoredHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [size, setSize] = useState(getStoredSize);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      const dx = dragRef.current.startX - ev.clientX;
      const dy = dragRef.current.startY - ev.clientY;
      const newW = Math.min(MAX_W, Math.max(MIN_W, dragRef.current.startW + dx));
      const newH = Math.min(MAX_H, Math.max(MIN_H, dragRef.current.startH + dy));
      setSize({ w: newW, h: newH });
    }

    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setSize(prev => {
        localStorage.setItem(SIZE_KEY, JSON.stringify(prev));
        return prev;
      });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [size.w, size.h]);

  // Trail isOpen by one frame for animation
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setPanelVisible(true));
    } else {
      setPanelVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && token) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setPassphraseError("");
    try {
      const res = await fetch("/api/chat/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase })
      });
      const data = await res.json();
      if (!res.ok) {
        setPassphraseError(data.error || "Incorrect passphrase.");
      } else {
        storeToken(data.token);
        setToken(data.token);
        setPassphrase("");
      }
    } catch {
      setPassphraseError("Connection error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function sendMessage(msg: string) {
    if (!msg.trim() || loading) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError("");
    const newMessages: Message[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-chat-token": token || ""
        },
        body: JSON.stringify({ message: msg, teamId: teamId || null, teamContext: teamContext || null, history: messages, currentGW: currentGW ?? null })
      });

      if (res.status === 401) {
        setToken(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
        setError("Session expired. Please re-enter the passphrase.");
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong.");
        return;
      }

      // Read SSE stream — add an empty model message and fill it as chunks arrive
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let started = false;

      setMessages(prev => [...prev, { role: "model", content: "" }]);

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break outer;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              setError(parsed.error);
              setMessages(prev => prev.slice(0, -1));
              break outer;
            }
            if (parsed.chunk) {
              if (!started) { setLoading(false); started = true; }
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "model",
                  content: updated[updated.length - 1].content + parsed.chunk
                };
                return updated;
              });
            }
          } catch {}
        }
      }

      if (!started) setMessages(prev => prev.slice(0, -1));
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    const container = containerRef.current;
    el.style.height = "auto";
    const maxHeight = container ? container.clientHeight * 0.2 : 120;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !loading) sendMessage(input);
    }
  }

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#141414] text-[#E4E3E0] rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform"
        aria-label="Open AI Chat"
      >
        {isOpen ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          ref={containerRef}
          className={`fixed bottom-24 right-6 z-50 bg-[#E4E3E0] border border-[#141414] shadow-2xl flex flex-col transition-all duration-200 ease-out ${panelVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          style={{
            width: `min(${size.w}px, calc(100vw - 3rem))`,
            height: `min(${size.h}px, calc(100vh - 8rem))`,
          }}
        >
          {/* Drag-to-resize handle — top-left corner, desktop only */}
          <div
            onMouseDown={onDragStart}
            className="absolute -top-1 -left-1 w-5 h-5 cursor-nw-resize hidden sm:flex items-center justify-center opacity-30 hover:opacity-80 transition-opacity z-10"
            title="Drag to resize"
          >
            <GripHorizontal size={12} className="rotate-45" />
          </div>

          {/* Header */}
          <div className="bg-[#141414] text-[#E4E3E0] px-4 py-3 flex items-center gap-2 shrink-0">
            <Bot size={16} />
            <div className="flex-1">
              <p className="font-mono text-xs uppercase tracking-widest leading-none">FPL Assistant</p>
              <p className="font-mono text-[9px] uppercase tracking-widest opacity-40 mt-0.5">Powered by Gemini</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); localStorage.removeItem(HISTORY_KEY); }}
                className="opacity-40 hover:opacity-100 transition-opacity"
                title="Clear history"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {!token ? (
            /* Passphrase gate */
            <form onSubmit={handleVerify} className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
              <Lock size={28} className="opacity-30" />
              <p className="font-serif italic text-xl text-center">Access Required</p>
              <p className="font-mono text-[10px] uppercase tracking-widest opacity-50 text-center">Enter your passphrase to unlock the AI assistant</p>
              <input
                type="password"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                placeholder="Passphrase"
                className="w-full bg-transparent border border-[#141414] px-3 py-2 font-mono text-sm outline-none placeholder-[#141414]/30"
                autoFocus
              />
              {passphraseError && (
                <p className="font-mono text-[10px] uppercase tracking-widest text-rose-600">{passphraseError}</p>
              )}
              <button
                type="submit"
                disabled={verifying || !passphrase}
                className="w-full bg-[#141414] text-[#E4E3E0] font-mono text-xs uppercase tracking-widest py-2 hover:opacity-80 transition-opacity disabled:opacity-30"
              >
                {verifying ? "Verifying..." : "Unlock"}
              </button>
            </form>
          ) : (
            /* Chat interface */
            <>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
                {messages.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <div className="flex flex-col items-center gap-2 opacity-30">
                      <Bot size={28} />
                      <p className="font-mono text-[10px] uppercase tracking-widest text-center">Ask anything about FPL</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 w-full">
                      {STARTER_PROMPTS.map(prompt => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          className="text-left px-3 py-2 border border-[#141414]/20 hover:border-[#141414] hover:bg-[#141414]/5 transition-all font-mono text-[10px] leading-tight opacity-60 hover:opacity-100"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center ${m.role === "user" ? "bg-[#141414] text-[#E4E3E0]" : "bg-[#141414]/10"}`}>
                      {m.role === "user" ? <User size={12} /> : <Bot size={12} />}
                    </div>
                    <div
                      className={`max-w-[82%] px-3 py-2 font-mono text-xs leading-relaxed ${m.role === "user" ? "bg-[#141414] text-[#E4E3E0]" : "bg-[#141414]/5 border border-[#141414]/10"}`}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                    />
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-2 items-center">
                    <div className="w-6 h-6 rounded-full bg-[#141414]/10 shrink-0 flex items-center justify-center">
                      <Bot size={12} />
                    </div>
                    <div className="bg-[#141414]/5 border border-[#141414]/10 px-4 py-3 flex gap-1.5 items-center">
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 bg-[#141414] rounded-full animate-bounce opacity-40"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {error && (
                  <p className="font-mono text-[10px] uppercase tracking-widest text-rose-600 text-center px-2">{error}</p>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="border-t border-[#141414] flex items-end shrink-0">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about players, fixtures..."
                  disabled={loading}
                  rows={1}
                  className="flex-1 bg-transparent px-3 py-3 font-mono text-xs outline-none placeholder-[#141414]/30 disabled:opacity-50 resize-none overflow-y-auto leading-relaxed"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="px-3 py-3 border-l border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-all disabled:opacity-30 shrink-0"
                >
                  <Send size={14} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
