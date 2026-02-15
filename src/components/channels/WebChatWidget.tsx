"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    MessageCircle,
    X,
    Send,
    Loader2,
    Minimize2,
    Maximize2,
    Sparkles,
    User,
    Bot,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface WebChatWidgetProps {
    channelId: string;
    token: string;
    gatewayUrl: string;
    config?: WidgetConfig;
}

interface WidgetConfig {
    name?: string;
    welcomeMessage?: string;
    primaryColor?: string;
    position?: "bottom-right" | "bottom-left";
    showAvatar?: boolean;
}

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
    isStreaming?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: WidgetConfig = {
    name: "AI Assistant",
    welcomeMessage: "Hi! How can I help you today?",
    primaryColor: "#6366f1",
    position: "bottom-right",
    showAvatar: true,
};

// ============================================================================
// Main Component
// ============================================================================

export function WebChatWidget({
    channelId,
    token,
    gatewayUrl,
    config: userConfig,
}: WebChatWidgetProps) {
    const config = { ...DEFAULT_CONFIG, ...userConfig };

    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isTyping, setIsTyping] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Add welcome message on first open
    useEffect(() => {
        if (isOpen && messages.length === 0 && config.welcomeMessage) {
            setMessages([
                {
                    id: "welcome",
                    role: "assistant",
                    content: config.welcomeMessage,
                    timestamp: new Date(),
                },
            ]);
        }
    }, [isOpen, config.welcomeMessage, messages.length]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // WebSocket connection
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(gatewayUrl);

        ws.onopen = () => {
            ws.send(JSON.stringify({
                type: "auth",
                payload: { token, channelId },
            }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === "auth_success") {
                    setIsConnected(true);
                } else if (data.type === "chat.start") {
                    setIsTyping(true);
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: data.messageId,
                            role: "assistant",
                            content: "",
                            timestamp: new Date(),
                            isStreaming: true,
                        },
                    ]);
                } else if (data.type === "chat.chunk") {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === data.messageId
                                ? { ...m, content: m.content + data.content }
                                : m
                        )
                    );
                } else if (data.type === "chat.end") {
                    setIsTyping(false);
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === data.messageId
                                ? { ...m, isStreaming: false }
                                : m
                        )
                    );
                }
            } catch {
                // Ignore parse errors
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
            // Reconnect after delay
            setTimeout(connect, 3000);
        };

        wsRef.current = ws;
    }, [gatewayUrl, token, channelId]);

    useEffect(() => {
        if (isOpen && !wsRef.current) {
            connect();
        }

        return () => {
            wsRef.current?.close();
        };
    }, [isOpen, connect]);

    const sendMessage = () => {
        if (!input.trim() || !isConnected) return;

        const message: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, message]);
        setInput("");

        wsRef.current?.send(
            JSON.stringify({
                type: "chat.send",
                payload: { content: message.content },
            })
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: "spring", damping: 25 }}
                        className={cn(
                            "fixed z-50 shadow-2xl rounded-2xl overflow-hidden border bg-background",
                            "flex flex-col",
                            config.position === "bottom-right" ? "right-6 bottom-24" : "left-6 bottom-24",
                            isExpanded
                                ? "w-[400px] h-[600px]"
                                : "w-[360px] h-[500px]"
                        )}
                        style={{
                            "--widget-primary": config.primaryColor,
                        } as React.CSSProperties}
                    >
                        {/* Header */}
                        <div
                            className="flex items-center justify-between px-4 py-3 text-white"
                            style={{ backgroundColor: config.primaryColor }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                    <Sparkles className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold">{config.name}</h3>
                                    <div className="flex items-center gap-1 text-xs text-white/80">
                                        <span
                                            className={cn(
                                                "w-2 h-2 rounded-full",
                                                isConnected ? "bg-green-400" : "bg-yellow-400"
                                            )}
                                        />
                                        {isConnected ? "Online" : "Connecting..."}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white hover:bg-white/20"
                                    onClick={() => setIsExpanded(!isExpanded)}
                                >
                                    {isExpanded ? (
                                        <Minimize2 className="h-4 w-4" />
                                    ) : (
                                        <Maximize2 className="h-4 w-4" />
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white hover:bg-white/20"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Messages */}
                        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                            <div className="space-y-4">
                                {messages.map((message) => (
                                    <motion.div
                                        key={message.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={cn(
                                            "flex items-start gap-2",
                                            message.role === "user" ? "flex-row-reverse" : ""
                                        )}
                                    >
                                        {config.showAvatar && (
                                            <div
                                                className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                                                    message.role === "user"
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-muted"
                                                )}
                                            >
                                                {message.role === "user" ? (
                                                    <User className="h-4 w-4" />
                                                ) : (
                                                    <Bot className="h-4 w-4" />
                                                )}
                                            </div>
                                        )}
                                        <div
                                            className={cn(
                                                "rounded-2xl px-4 py-2 max-w-[80%]",
                                                message.role === "user"
                                                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                                                    : "bg-muted rounded-tl-sm"
                                            )}
                                        >
                                            <p className="text-sm whitespace-pre-wrap">
                                                {message.content}
                                                {message.isStreaming && (
                                                    <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse" />
                                                )}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}

                                {isTyping && !messages.some((m) => m.isStreaming) && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex items-center gap-2"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                            <Bot className="h-4 w-4" />
                                        </div>
                                        <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                                            <div className="flex gap-1">
                                                <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                                <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                                <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        </ScrollArea>

                        {/* Input */}
                        <div className="p-4 border-t">
                            <div className="flex items-center gap-2">
                                <Input
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Type a message..."
                                    className="flex-1"
                                    disabled={!isConnected}
                                />
                                <Button
                                    size="icon"
                                    onClick={sendMessage}
                                    disabled={!input.trim() || !isConnected}
                                    style={{ backgroundColor: config.primaryColor }}
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground text-center mt-2">
                                Powered by MaiaChat
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Button */}
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "fixed z-50 w-14 h-14 rounded-full shadow-lg",
                    "flex items-center justify-center text-white",
                    "transition-shadow hover:shadow-xl",
                    config.position === "bottom-right" ? "right-6 bottom-6" : "left-6 bottom-6"
                )}
                style={{ backgroundColor: config.primaryColor }}
            >
                <AnimatePresence mode="wait">
                    {isOpen ? (
                        <motion.div
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                        >
                            <X className="h-6 w-6" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="chat"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                        >
                            <MessageCircle className="h-6 w-6" />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Unread badge */}
                {!isOpen && messages.filter((m) => m.role === "assistant").length > 1 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
                        !
                    </span>
                )}
            </motion.button>
        </>
    );
}

// ============================================================================
// Embed Script Generator
// ============================================================================

export function generateEmbedCode(channelId: string, token: string, config?: WidgetConfig): string {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    return `<!-- MaiaChat Widget -->
<script>
  (function() {
    var script = document.createElement('script');
    script.src = '${baseUrl}/webchat.js';
    script.async = true;
    script.onload = function() {
      MaiaChat.init({
        channelId: '${channelId}',
        token: '${token}',
        ${config?.name ? `name: '${config.name}',` : ''}
        ${config?.welcomeMessage ? `welcomeMessage: '${config.welcomeMessage}',` : ''}
        ${config?.primaryColor ? `primaryColor: '${config.primaryColor}',` : ''}
        ${config?.position ? `position: '${config.position}',` : ''}
      });
    };
    document.head.appendChild(script);
  })();
</script>`;
}
