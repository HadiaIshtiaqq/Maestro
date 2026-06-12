import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Send, X, Bot, User, Sparkles } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface EmergencyChatProps {
  alert: {
    id: string;
    description: string;
    severity: string;
  };
}

export default function EmergencyChat({ alert }: EmergencyChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `System Nexus AI standby. I have context on the ${alert.severity} alert: "${alert.description}". How can I assist with tactical orchestration?`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [isOpen, alert]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Mock AI Response with logic trace simulation
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Analyzing directive... Based on the current ${alert.severity} status, I recommend prioritizing Sector 4 containment. Simulation suggests an 84% probability of successful mitigation if rescue units are deployed within 180 seconds. Shall I prepare the deployment sequence?`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="fixed bottom-4 right-4 md:bottom-10 md:right-10 z-[80] flex flex-col items-end gap-4 pointer-events-none max-w-[calc(100vw-2rem)]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full sm:w-96 h-[500px] max-h-[calc(100vh-8rem)] bg-surface-container/95 md:bg-surface-container/90 backdrop-blur-3xl border border-white/10 rounded-[28px] md:rounded-[32px] shadow-2xl overflow-hidden flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-xl">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight text-on-surface">Nexus Command AI</h3>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-primary font-bold">Active Tactical Link</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/5 rounded-xl text-on-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-surface-lowest/30"
            >
              {messages.map((msg) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    msg.role === "user" ? "bg-secondary/20 text-secondary" : "bg-primary/20 text-primary"
                  )}>
                    {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={cn(
                    "max-w-[80%] p-4 rounded-2xl text-xs leading-relaxed",
                    msg.role === "user" 
                      ? "bg-secondary/10 border border-secondary/20 text-on-surface rounded-tr-none" 
                      : "bg-white/5 border border-white/5 text-on-surface/90 rounded-tl-none shadow-inner"
                  )}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl rounded-tl-none flex gap-1">
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 bg-surface-lowest/50 border-t border-white/5">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Ask for tactical advice..."
                  className="w-full bg-surface-container border border-white/10 rounded-2xl py-3 pl-4 pr-12 text-xs text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/50 focus:ring-0 transition-all"
                />
                <button
                  onClick={handleSend}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-on-primary rounded-xl hover:shadow-[0_0_15px_rgba(6,182,212,0.5)] transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 opacity-30 justify-center">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-[8px] font-mono font-bold uppercase tracking-[0.2em]">Neural Engine v4.2 Trace Interface</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        layout
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "pointer-events-auto h-16 rounded-[24px] flex items-center gap-4 px-6 shadow-2xl transition-all duration-300",
          isOpen ? "bg-error text-white" : "bg-primary text-on-primary shadow-[0_10px_30px_rgba(6,182,212,0.4)]"
        )}
      >
        <div className="relative">
          <MessageSquare className="w-6 h-6" />
          {!isOpen && (
            <motion.div 
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full"
            />
          )}
        </div>
        {!isOpen && <span className="font-bold text-sm tracking-tight">TACTICAL CHAT</span>}
        {isOpen && <span className="font-bold text-sm tracking-tight">CLOSE SESSION</span>}
      </motion.button>
    </div>
  );
}
