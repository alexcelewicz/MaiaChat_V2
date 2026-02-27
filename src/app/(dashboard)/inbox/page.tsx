'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Inbox,
  Search,
  Filter,
  CheckCheck,
  Clock,
  MessageCircle,
  ArrowRight,
  Loader2,
  RefreshCw,
  Sparkles,
  ChevronDown,
  X,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import Link from 'next/link';

// ============================================================================
// Types
// ============================================================================

interface ChannelMessage {
  id: string;
  channelType: string;
  channelId: string;
  channelName?: string;
  content: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: string;
  isRead: boolean;
  isProcessed: boolean;
  conversationId?: string;
  threadId?: string;
  attachments?: Array<{ type: string; name: string }>;
}

interface ChannelStats {
  type: string;
  unread: number;
  total: number;
}

const INBOX_POLL_INTERVAL_MS = 15000;

// ============================================================================
// Channel Icons & Colors
// ============================================================================

const CHANNEL_CONFIG: Record<
  string,
  { icon: string; color: string; gradient: string; name: string }
> = {
  slack: {
    icon: '💬',
    color: 'text-purple-500',
    gradient: 'from-purple-500/20 to-purple-600/10',
    name: 'Slack',
  },
  discord: {
    icon: '🎮',
    color: 'text-indigo-500',
    gradient: 'from-indigo-500/20 to-indigo-600/10',
    name: 'Discord',
  },
  telegram: {
    icon: '✈️',
    color: 'text-blue-500',
    gradient: 'from-blue-500/20 to-blue-600/10',
    name: 'Telegram',
  },
  teams: {
    icon: '👥',
    color: 'text-blue-600',
    gradient: 'from-blue-600/20 to-blue-700/10',
    name: 'Teams',
  },
  matrix: {
    icon: '🔗',
    color: 'text-green-500',
    gradient: 'from-green-500/20 to-green-600/10',
    name: 'Matrix',
  },
  webchat: {
    icon: '🌐',
    color: 'text-gray-500',
    gradient: 'from-gray-500/20 to-gray-600/10',
    name: 'WebChat',
  },
};

// ============================================================================
// Main Component
// ============================================================================

export default function UnifiedInboxPage() {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [stats, setStats] = useState<ChannelStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());

  const fetchMessages = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) setLoading(true);
        else setRefreshing(true);

        const params = new URLSearchParams();
        if (filter) params.set('channel', filter);
        if (searchQuery) params.set('search', searchQuery);

        const response = await fetch(`/api/inbox?${params}`);
        if (!response.ok) throw new Error('Failed to fetch messages');

        const data = await response.json();
        setMessages(data.messages || []);
        setStats(data.stats || []);
      } catch (error) {
        console.error('Fetch inbox error:', error);
        // Use mock data for demo
        setMessages(getMockMessages());
        setStats(getMockStats());
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, searchQuery]
  );

  useEffect(() => {
    void fetchMessages();

    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchMessages(false);
    }, INBOX_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleMarkRead = async (ids: string[]) => {
    try {
      await fetch('/api/inbox/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, isRead: true } : m)));
      setSelectedMessages(new Set());
      toast.success(`Marked ${ids.length} message(s) as read`);
    } catch (error) {
      toast.error('Failed to mark messages as read');
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (filter && m.channelType !== filter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return m.content.toLowerCase().includes(query) || m.senderName.toLowerCase().includes(query);
    }
    return true;
  });

  const unreadCount = messages.filter((m) => !m.isRead).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header - Editorial Style */}
      <div className="relative overflow-hidden border-b">
        {/* Decorative background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative container max-w-7xl mx-auto px-6 py-12">
          <div className="flex items-start justify-between gap-8">
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
              >
                <Inbox className="h-4 w-4" />
                <span>Unified Inbox</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {unreadCount}
                  </span>
                )}
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-5xl font-bold tracking-tight"
              >
                All your messages,
                <br />
                <span className="text-primary">one place.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg text-muted-foreground max-w-md"
              >
                Messages from Slack, Discord, Telegram, and more—unified with AI-powered responses.
              </motion.p>
            </div>

            {/* Channel Stats Cards */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="hidden lg:grid grid-cols-3 gap-3"
            >
              {stats.slice(0, 3).map((stat, i) => {
                const config = CHANNEL_CONFIG[stat.type] || CHANNEL_CONFIG.webchat;
                return (
                  <motion.button
                    key={stat.type}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    onClick={() => setFilter(filter === stat.type ? null : stat.type)}
                    className={cn(
                      'relative group p-4 rounded-2xl border bg-card/50 backdrop-blur-sm transition-all duration-300',
                      'hover:shadow-lg hover:scale-105 hover:border-primary/30',
                      filter === stat.type && 'ring-2 ring-primary border-primary/50'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute inset-0 rounded-2xl bg-gradient-to-br opacity-50',
                        config.gradient
                      )}
                    />
                    <div className="relative">
                      <div className="text-2xl mb-2">{config.icon}</div>
                      <div className="text-sm font-medium">{config.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-2xl font-bold tabular-nums">{stat.unread}</span>
                        <span className="text-xs text-muted-foreground">unread</span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b">
        <div className="container max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Channel Filter Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="h-4 w-4" />
                    {filter ? CHANNEL_CONFIG[filter]?.name || filter : 'All Channels'}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => setFilter(null)}>
                    <span className="mr-2">📥</span>
                    All Channels
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {Object.entries(CHANNEL_CONFIG).map(([type, config]) => (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => setFilter(type)}
                      className={cn(filter === type && 'bg-accent')}
                    >
                      <span className="mr-2">{config.icon}</span>
                      {config.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Search Toggle */}
              <AnimatePresence mode="wait">
                {showSearch ? (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 300, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="relative"
                  >
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search messages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-10"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => {
                        setShowSearch(false);
                        setSearchQuery('');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Button variant="outline" size="icon" onClick={() => setShowSearch(true)}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2">
              {selectedMessages.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-sm text-muted-foreground">
                    {selectedMessages.size} selected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMarkRead(Array.from(selectedMessages))}
                  >
                    <CheckCheck className="h-4 w-4 mr-1" />
                    Mark Read
                  </Button>
                </motion.div>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchMessages(false)}
                disabled={refreshing}
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Messages List */}
      <div className="container max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading messages...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
              <Inbox className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Inbox Zero! 🎉</h3>
            <p className="text-muted-foreground max-w-sm">
              {searchQuery
                ? 'No messages match your search.'
                : "You're all caught up. New messages will appear here."}
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/channels">
                Connect more channels
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredMessages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  index={index}
                  isSelected={selectedMessages.has(message.id)}
                  onToggleSelect={() => {
                    setSelectedMessages((prev) => {
                      const next = new Set(prev);
                      if (next.has(message.id)) next.delete(message.id);
                      else next.add(message.id);
                      return next;
                    });
                  }}
                  onMarkRead={() => handleMarkRead([message.id])}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Message Row Component
// ============================================================================

function MessageRow({
  message,
  index,
  isSelected,
  onToggleSelect,
  onMarkRead,
}: {
  message: ChannelMessage;
  index: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  onMarkRead: () => void;
}) {
  const config = CHANNEL_CONFIG[message.channelType] || CHANNEL_CONFIG.webchat;
  const timeAgo = getTimeAgo(message.timestamp);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        'group relative flex items-start gap-4 p-4 rounded-xl border transition-all duration-200',
        'hover:bg-muted/50 hover:shadow-sm',
        isSelected && 'bg-primary/5 border-primary/30',
        !message.isRead && 'bg-card shadow-sm border-l-4 border-l-primary'
      )}
    >
      {/* Selection checkbox */}
      <button
        onClick={onToggleSelect}
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded-md border-2 transition-all',
          'flex items-center justify-center',
          isSelected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/30 hover:border-primary/50'
        )}
      >
        {isSelected && <CheckCheck className="h-3 w-3" />}
      </button>

      {/* Channel indicator */}
      <div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl',
          'bg-gradient-to-br',
          config.gradient
        )}
      >
        {config.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold truncate">{message.senderName}</span>
          <Badge variant="outline" className="text-xs font-normal">
            {message.channelName || config.name}
          </Badge>
          {message.isProcessed && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              AI Replied
            </Badge>
          )}
        </div>

        <p
          className={cn(
            'text-sm line-clamp-2',
            message.isRead ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {message.content}
        </p>

        {message.attachments && message.attachments.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {message.attachments.slice(0, 3).map((att, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                📎 {att.name}
              </Badge>
            ))}
            {message.attachments.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{message.attachments.length - 3} more
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Time & Actions */}
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {timeAgo}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!message.isRead && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMarkRead}>
              <CheckCheck className="h-4 w-4" />
            </Button>
          )}
          {message.conversationId && (
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href={`/chat/${message.conversationId}`}>
                <MessageCircle className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Zap className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diff = now.getTime() - then.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString();
}

function getMockMessages(): ChannelMessage[] {
  return [
    {
      id: '1',
      channelType: 'slack',
      channelId: 'C123',
      channelName: '#general',
      content:
        "Hey team! Just wanted to check in on the project status. Are we on track for Friday's deadline?",
      senderName: 'Sarah Chen',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      isRead: false,
      isProcessed: true,
      conversationId: 'conv-1',
    },
    {
      id: '2',
      channelType: 'discord',
      channelId: 'D456',
      channelName: 'dev-chat',
      content: 'The new API endpoint is live! Can someone help test it?',
      senderName: 'Alex Kim',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      isRead: false,
      isProcessed: false,
    },
    {
      id: '3',
      channelType: 'telegram',
      channelId: 'T789',
      content: 'Meeting rescheduled to 3pm. Please confirm attendance.',
      senderName: 'Mike Johnson',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      isRead: true,
      isProcessed: true,
      conversationId: 'conv-3',
    },
    {
      id: '4',
      channelType: 'teams',
      channelId: 'M111',
      channelName: 'Engineering',
      content: 'Q4 roadmap review document is ready for comments. Please review by EOD.',
      senderName: 'Lisa Wang',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      isRead: true,
      isProcessed: false,
      attachments: [{ type: 'doc', name: 'Q4_Roadmap.pdf' }],
    },
    {
      id: '5',
      channelType: 'slack',
      channelId: 'C123',
      channelName: '#support',
      content:
        'Customer issue escalated: User unable to access their dashboard after password reset.',
      senderName: 'Support Bot',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      isRead: true,
      isProcessed: true,
      conversationId: 'conv-5',
    },
  ];
}

function getMockStats(): ChannelStats[] {
  return [
    { type: 'slack', unread: 3, total: 15 },
    { type: 'discord', unread: 1, total: 8 },
    { type: 'telegram', unread: 2, total: 12 },
    { type: 'teams', unread: 0, total: 5 },
  ];
}
