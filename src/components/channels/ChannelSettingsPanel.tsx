"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Bot,
    Brain,
    FileSearch,
    Mic,
    Volume2,
    Eye,
    Wrench,
    Users,
    Sparkles,
    ChevronDown,
    ChevronRight,
    Save,
    RotateCcw,
    Loader2,
    Check,
    AlertCircle,
    Zap,
    Settings2,
    MessageSquare,
    UserCheck,
    Plus,
    Trash2,
    ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { StoreSelector } from "@/components/gemini/StoreSelector";
import type { ChannelConfig, ContactRule } from "@/lib/db/schema";

// ============================================================================
// Types
// ============================================================================

interface ChannelSettingsPanelProps {
    channelId: string;
    channelType: string;
    channelName: string;
    isOpen: boolean;
    onClose: () => void;
    onSave?: () => void;
}

interface Agent {
    id: string;
    name: string;
    role: string;
    modelId: string;
}

interface Document {
    id: string;
    filename: string;
    mimeType: string;
    metadata?: Record<string, unknown> | null;
}

interface Skill {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    isEnabled?: boolean;
}

interface KnownContact {
    id: string;
    name: string | null;
    lastMessageAt: string;
    messageCount: number;
}

// ============================================================================
// Section Component
// ============================================================================

function SettingsSection({
    title,
    description,
    icon: Icon,
    children,
    defaultOpen = false,
    badge,
    accentColor = "primary",
}: {
    title: string;
    description?: string;
    icon: React.ElementType;
    children: React.ReactNode;
    defaultOpen?: boolean;
    badge?: string;
    accentColor?: "primary" | "green" | "orange" | "purple" | "cyan";
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    const accentClasses = {
        primary: "from-primary/20 to-transparent border-primary/30",
        green: "from-emerald-500/20 to-transparent border-emerald-500/30",
        orange: "from-orange-500/20 to-transparent border-orange-500/30",
        purple: "from-purple-500/20 to-transparent border-purple-500/30",
        cyan: "from-cyan-500/20 to-transparent border-cyan-500/30",
    };

    const iconClasses = {
        primary: "text-primary",
        green: "text-emerald-500",
        orange: "text-orange-500",
        purple: "text-purple-500",
        cyan: "text-cyan-500",
    };

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                <button
                    className={cn(
                        "w-full flex items-center justify-between p-4 rounded-xl",
                        "bg-gradient-to-r border transition-all duration-300",
                        "hover:shadow-lg hover:shadow-primary/5",
                        accentClasses[accentColor],
                        isOpen && "shadow-lg shadow-primary/5"
                    )}
                >
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-lg bg-background/50 backdrop-blur-sm",
                            iconClasses[accentColor]
                        )}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{title}</span>
                                {badge && (
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] px-1.5 py-0 font-medium"
                                    >
                                        {badge}
                                    </Badge>
                                )}
                            </div>
                            {description && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>
                    <motion.div
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </motion.div>
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="px-4 py-4 space-y-4 border-x border-b rounded-b-xl border-border/50 bg-card/30"
                >
                    {children}
                </motion.div>
            </CollapsibleContent>
        </Collapsible>
    );
}

// ============================================================================
// Toggle Row Component
// ============================================================================

function ToggleRow({
    label,
    description,
    checked,
    onCheckedChange,
    disabled = false,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
                <Label className="text-sm font-medium">{label}</Label>
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </div>
            <Switch
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                className="data-[state=checked]:bg-primary"
            />
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export function ChannelSettingsPanel({
    channelId,
    channelType,
    channelName,
    isOpen,
    onClose,
    onSave,
}: ChannelSettingsPanelProps) {
    const [config, setConfig] = useState<ChannelConfig>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [skills, setSkills] = useState<Skill[]>([]);
    const [knownContacts, setKnownContacts] = useState<KnownContact[]>([]);
    const [contactsLoading, setContactsLoading] = useState(false);
    const [newContactId, setNewContactId] = useState("");

    // Fetch channel config
    useEffect(() => {
        if (isOpen && channelId) {
            fetchConfig();
            fetchAgents();
            fetchDocuments();
            fetchSkills();
        }
    }, [isOpen, channelId]);

    const fetchConfig = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/channels/${channelId}`);
            if (!res.ok) throw new Error("Failed to fetch config");
            const data = await res.json();
            setConfig(data.account?.config || {});
        } catch (error) {
            console.error("Fetch config error:", error);
            toast.error("Failed to load channel settings");
        } finally {
            setLoading(false);
        }
    };

    const fetchAgents = async () => {
        try {
            const res = await fetch("/api/agents");
            if (res.ok) {
                const data = await res.json();
                setAgents(data.agents || []);
            }
        } catch (error) {
            console.error("Fetch agents error:", error);
        }
    };

    const fetchDocuments = async () => {
        try {
            const res = await fetch("/api/documents");
            if (res.ok) {
                const data = await res.json();
                setDocuments(data.documents || []);
            }
        } catch (error) {
            console.error("Fetch documents error:", error);
        }
    };

    const fetchSkills = async () => {
        try {
            const res = await fetch("/api/skills");
            if (res.ok) {
                const data = await res.json();
                setSkills(data.skills || []);
            }
        } catch (error) {
            console.error("Fetch skills error:", error);
        }
    };

    const fetchContacts = async () => {
        try {
            setContactsLoading(true);
            const res = await fetch(`/api/channels/${channelId}/contacts`);
            if (res.ok) {
                const data = await res.json();
                setKnownContacts(data.contacts || []);
            }
        } catch (error) {
            console.error("Fetch contacts error:", error);
        } finally {
            setContactsLoading(false);
        }
    };

    const updateContactRule = (senderId: string, updates: Partial<ContactRule>) => {
        const current = config.contactRules || {};
        const existing = current[senderId] || { autoReply: true };
        updateConfig({
            contactRules: {
                ...current,
                [senderId]: { ...existing, ...updates },
            },
        });
    };

    const removeContactRule = (senderId: string) => {
        const current = { ...config.contactRules };
        delete current[senderId];
        updateConfig({ contactRules: Object.keys(current).length ? current : undefined });
    };

    const addManualContact = () => {
        const trimmed = newContactId.trim();
        if (!trimmed) return;
        updateContactRule(trimmed, { autoReply: true });
        setNewContactId("");
    };

    const updateConfig = useCallback((updates: Partial<ChannelConfig>) => {
        setConfig((prev) => ({ ...prev, ...updates }));
        setHasChanges(true);
    }, []);

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await fetch(`/api/channels/${channelId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config }),
            });

            if (!res.ok) throw new Error("Failed to save");

            toast.success("Settings saved successfully");
            setHasChanges(false);
            onSave?.();
        } catch (error) {
            console.error("Save error:", error);
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setConfig({});
        setHasChanges(true);
    };

    const channelIcons: Record<string, string> = {
        telegram: "✈️",
        discord: "🎮",
        slack: "💬",
        webchat: "🌐",
        matrix: "🔗",
    };

    const geminiDocuments = documents.filter((doc) => {
        const metadata = doc.metadata as Record<string, unknown> | null;
        return Boolean(metadata?.geminiFile);
    });
    const enabledUserSkills = skills.filter((skill) => skill.isEnabled);

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                className="w-full sm:max-w-[540px] p-0 flex flex-col bg-gradient-to-b from-background to-muted/20"
                side="right"
            >
                {/* Header */}
                <SheetHeader className="px-6 py-5 border-b bg-card/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10 text-2xl">
                            {channelIcons[channelType] || "📱"}
                        </div>
                        <div>
                            <SheetTitle className="text-lg font-bold tracking-tight">
                                {channelName || `${channelType} Settings`}
                            </SheetTitle>
                            <SheetDescription className="text-xs">
                                Configure AI behavior for this channel
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                {/* Content */}
                <ScrollArea className="flex-1 px-4 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Auto-Reply */}
                            <SettingsSection
                                title="Auto-Reply"
                                description="Control whether the AI responds automatically"
                                icon={MessageSquare}
                                defaultOpen={true}
                                accentColor="green"
                            >
                                <div className="space-y-2">
                                    <ToggleRow
                                        label="Enable Auto-Reply"
                                        description="When enabled, the AI will automatically respond to incoming messages. When disabled, messages appear in your inbox without triggering responses."
                                        checked={config.autoReplyEnabled ?? false}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ autoReplyEnabled: checked })
                                        }
                                    />
                                    {!config.autoReplyEnabled && (
                                        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                                            Notification relay mode — incoming messages are stored in your inbox but no AI responses are sent.
                                        </p>
                                    )}
                                </div>
                            </SettingsSection>

                            {/* Contact Rules */}
                            <SettingsSection
                                title="Contact Rules"
                                description="Per-contact auto-reply overrides"
                                icon={UserCheck}
                                accentColor="green"
                            >
                                <div className="space-y-4">
                                    <p className="text-xs text-muted-foreground">
                                        Override the global auto-reply toggle for specific contacts. Each contact can have custom AI instructions.
                                    </p>

                                    {/* Load known contacts button */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={fetchContacts}
                                        disabled={contactsLoading}
                                        className="w-full"
                                    >
                                        {contactsLoading ? (
                                            <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                        ) : (
                                            <UserCheck className="h-3 w-3 mr-2" />
                                        )}
                                        Load Known Contacts
                                    </Button>

                                    {/* Known contacts list (for quick-add) */}
                                    {knownContacts.length > 0 && (
                                        <div className="space-y-1">
                                            <Label className="text-xs text-muted-foreground">
                                                Recent Contacts ({knownContacts.length})
                                            </Label>
                                            <div className="max-h-32 overflow-y-auto space-y-1">
                                                {knownContacts
                                                    .filter((c) => c.id && !config.contactRules?.[c.id])
                                                    .map((contact, idx) => (
                                                        <button
                                                            key={contact.id || `contact-${idx}`}
                                                            type="button"
                                                            onClick={() => updateContactRule(contact.id, {
                                                                autoReply: true,
                                                                label: contact.name || undefined,
                                                            })}
                                                            className="w-full flex items-center justify-between p-2 rounded-lg border border-border hover:border-emerald-500/50 transition-all text-left"
                                                        >
                                                            <div className="min-w-0">
                                                                <span className="text-sm font-medium truncate block">
                                                                    {contact.name || "Unknown"}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground truncate block">
                                                                    {contact.id}
                                                                </span>
                                                            </div>
                                                            <Plus className="h-3 w-3 text-muted-foreground flex-shrink-0 ml-2" />
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Manual add */}
                                    <div className="flex gap-2">
                                        <Input
                                            value={newContactId}
                                            onChange={(e) => setNewContactId(e.target.value)}
                                            placeholder="Sender ID (e.g. 48123456789@s.whatsapp.net)"
                                            className="h-8 text-xs"
                                            onKeyDown={(e) => e.key === "Enter" && addManualContact()}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={addManualContact}
                                            disabled={!newContactId.trim()}
                                            className="h-8 px-3"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    </div>

                                    {/* Configured rules */}
                                    {config.contactRules && Object.keys(config.contactRules).length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground">
                                                Active Rules ({Object.keys(config.contactRules).length})
                                            </Label>
                                            {Object.entries(config.contactRules).map(([senderId, rule]) => (
                                                <div
                                                    key={senderId}
                                                    className={cn(
                                                        "p-3 rounded-lg border space-y-2",
                                                        rule.autoReply
                                                            ? "border-emerald-500/30 bg-emerald-500/5"
                                                            : "border-red-500/30 bg-red-500/5"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium truncate">
                                                                    {rule.label || senderId.split("@")[0]}
                                                                </span>
                                                                <Badge
                                                                    variant={rule.autoReply ? "default" : "destructive"}
                                                                    className="text-[10px] px-1.5 py-0"
                                                                >
                                                                    {rule.autoReply ? "Auto-Reply ON" : "Muted"}
                                                                </Badge>
                                                            </div>
                                                            <span className="text-[10px] text-muted-foreground truncate block">
                                                                {senderId}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                            <Switch
                                                                checked={rule.autoReply}
                                                                onCheckedChange={(checked) =>
                                                                    updateContactRule(senderId, { autoReply: checked })
                                                                }
                                                                className="data-[state=checked]:bg-emerald-500"
                                                            />
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => removeContactRule(senderId)}
                                                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Label */}
                                                    <Input
                                                        value={rule.label || ""}
                                                        onChange={(e) =>
                                                            updateContactRule(senderId, {
                                                                label: e.target.value || undefined,
                                                            })
                                                        }
                                                        placeholder="Label (e.g. Wife, Colleague, Spam)"
                                                        className="h-7 text-xs"
                                                    />

                                                    {/* Instructions (only when auto-reply ON) */}
                                                    {rule.autoReply && (
                                                        <textarea
                                                            value={rule.instructions || ""}
                                                            onChange={(e) =>
                                                                updateContactRule(senderId, {
                                                                    instructions: e.target.value || undefined,
                                                                })
                                                            }
                                                            placeholder="Custom AI instructions for this contact..."
                                                            className="w-full h-16 px-2 py-1.5 text-xs rounded-md border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </SettingsSection>

                            {/* Model Selection */}
                            <SettingsSection
                                title="AI Model"
                                description="Choose the AI model for responses"
                                icon={Brain}
                                defaultOpen={true}
                                accentColor="purple"
                            >
                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-xs text-muted-foreground mb-2 block">
                                            Model
                                        </Label>
                                        <ModelSelector
                                            selectedModel={config.model || "claude-sonnet-4-20250514"}
                                            onModelChange={(model) => updateConfig({ model })}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs text-muted-foreground">
                                                Temperature
                                            </Label>
                                            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                                                {(config.temperature ?? 0.7).toFixed(1)}
                                            </span>
                                        </div>
                                        <Slider
                                            value={[config.temperature ?? 0.7]}
                                            onValueChange={([value]) =>
                                                updateConfig({ temperature: value })
                                            }
                                            min={0}
                                            max={2}
                                            step={0.1}
                                            className="py-2"
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>Precise</span>
                                            <span>Creative</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">
                                            Max Output Tokens
                                        </Label>
                                        <Input
                                            type="number"
                                            value={config.maxTokens || ""}
                                            onChange={(e) =>
                                                updateConfig({
                                                    maxTokens: e.target.value
                                                        ? parseInt(e.target.value)
                                                        : undefined,
                                                })
                                            }
                                            placeholder="4096 (default)"
                                            className="h-9"
                                        />
                                    </div>
                                </div>
                            </SettingsSection>

                            {/* Agent Configuration */}
                            <SettingsSection
                                title="Agent"
                                description="Use a custom AI persona"
                                icon={Bot}
                                accentColor="cyan"
                            >
                                <div className="space-y-4">
                                    <div>
                                        <Label className="text-xs text-muted-foreground mb-2 block">
                                            Single Agent
                                        </Label>
                                        <Select
                                            value={config.agentId || "none"}
                                            onValueChange={(value) =>
                                                updateConfig({
                                                    agentId: value === "none" ? undefined : value,
                                                })
                                            }
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Select an agent" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">
                                                    <span className="text-muted-foreground">
                                                        Default Assistant
                                                    </span>
                                                </SelectItem>
                                                {agents.map((agent) => (
                                                    <SelectItem key={agent.id} value={agent.id}>
                                                        <div className="flex items-center gap-2">
                                                            <span>{agent.name}</span>
                                                            <Badge variant="outline" className="text-[10px]">
                                                                {agent.role}
                                                            </Badge>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </SettingsSection>

                            {/* Multi-Agent */}
                            <SettingsSection
                                title="Multi-Agent"
                                description="Orchestrate multiple AI agents"
                                icon={Users}
                                badge="Pro"
                                accentColor="orange"
                            >
                                <div className="space-y-4">
                                    <ToggleRow
                                        label="Enable Multi-Agent"
                                        description="Use multiple agents for complex tasks"
                                        checked={config.multiAgentEnabled ?? false}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ multiAgentEnabled: checked })
                                        }
                                    />

                                    {config.multiAgentEnabled && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-4 pt-2"
                                        >
                                            <div>
                                                <Label className="text-xs text-muted-foreground mb-2 block">
                                                    Orchestration Mode
                                                </Label>
                                                <Select
                                                    value={config.multiAgentMode || "sequential"}
                                                    onValueChange={(value) =>
                                                        updateConfig({
                                                            multiAgentMode: value as ChannelConfig["multiAgentMode"],
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="sequential">
                                                            <div className="flex flex-col">
                                                                <span>Sequential</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    Agents respond in order
                                                                </span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="parallel">
                                                            <div className="flex flex-col">
                                                                <span>Parallel</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    All agents respond at once
                                                                </span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="consensus">
                                                            <div className="flex flex-col">
                                                                <span>Consensus</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    Agents discuss to agree
                                                                </span>
                                                            </div>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {config.multiAgentMode === "consensus" && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs text-muted-foreground">
                                                            Max Rounds
                                                        </Label>
                                                        <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                                                            {config.multiAgentMaxRounds ?? 3}
                                                        </span>
                                                    </div>
                                                    <Slider
                                                        value={[config.multiAgentMaxRounds ?? 3]}
                                                        onValueChange={([value]) =>
                                                            updateConfig({ multiAgentMaxRounds: value })
                                                        }
                                                        min={1}
                                                        max={10}
                                                        step={1}
                                                    />
                                                </div>
                                            )}

                                            <div>
                                                <Label className="text-xs text-muted-foreground mb-2 block">
                                                    Select Agents ({(config.multiAgentIds || []).length} selected)
                                                </Label>
                                                <div className="grid gap-2 max-h-40 overflow-y-auto p-1">
                                                    {agents.map((agent) => {
                                                        const isSelected = (
                                                            config.multiAgentIds || []
                                                        ).includes(agent.id);
                                                        return (
                                                            <button
                                                                key={agent.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    const current = config.multiAgentIds || [];
                                                                    const updated = isSelected
                                                                        ? current.filter((id) => id !== agent.id)
                                                                        : [...current, agent.id];
                                                                    updateConfig({ multiAgentIds: updated });
                                                                }}
                                                                className={cn(
                                                                    "flex items-center justify-between p-2.5 rounded-lg border transition-all",
                                                                    isSelected
                                                                        ? "border-primary bg-primary/5"
                                                                        : "border-border hover:border-primary/50"
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium text-sm">
                                                                        {agent.name}
                                                                    </span>
                                                                    <Badge
                                                                        variant="secondary"
                                                                        className="text-[10px]"
                                                                    >
                                                                        {agent.role}
                                                                    </Badge>
                                                                </div>
                                                                {isSelected && (
                                                                    <Check className="h-4 w-4 text-primary" />
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                    {agents.length === 0 && (
                                                        <p className="text-sm text-muted-foreground text-center py-4">
                                                            No agents created yet
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </SettingsSection>

                            {/* RAG Settings */}
                            <SettingsSection
                                title="Document Search (RAG)"
                                description="Search your uploaded documents"
                                icon={FileSearch}
                                accentColor="green"
                            >
                                <div className="space-y-4">
                                    <ToggleRow
                                        label="Enable RAG"
                                        description="Include document context in responses"
                                        checked={config.ragEnabled ?? false}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ ragEnabled: checked })
                                        }
                                    />

                                    {config.ragEnabled && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            className="space-y-4 pt-2"
                                        >
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs text-muted-foreground">
                                                        Top K Results
                                                    </Label>
                                                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                                                        {config.ragTopK ?? 5}
                                                    </span>
                                                </div>
                                                <Slider
                                                    value={[config.ragTopK ?? 5]}
                                                    onValueChange={([value]) =>
                                                        updateConfig({ ragTopK: value })
                                                    }
                                                    min={1}
                                                    max={20}
                                                    step={1}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs text-muted-foreground">
                                                        Similarity Threshold
                                                    </Label>
                                                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                                                        {((config.ragThreshold ?? 0.7) * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                                <Slider
                                                    value={[config.ragThreshold ?? 0.7]}
                                                    onValueChange={([value]) =>
                                                        updateConfig({ ragThreshold: value })
                                                    }
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </SettingsSection>

                            {/* Gemini File Search */}
                            <SettingsSection
                                title="Gemini File Search"
                                description="Use Gemini as a retriever across your files"
                                icon={Sparkles}
                                accentColor="orange"
                            >
                                <div className="space-y-4">
                                    <ToggleRow
                                        label="Enable Gemini File Search"
                                        description="Use Gemini file search stores for retrieval context"
                                        checked={config.geminiFileSearchEnabled ?? false}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ geminiFileSearchEnabled: checked })
                                        }
                                    />

                                    {config.geminiFileSearchEnabled && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            className="space-y-3 pt-2"
                                        >
                                            {/* Gemini Stores (persistent, preferred) */}
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">
                                                    Gemini Stores (Persistent)
                                                </Label>
                                                <StoreSelector
                                                    selectedStoreIds={config.geminiStoreIds || []}
                                                    onStoreChange={(ids) =>
                                                        updateConfig({ geminiStoreIds: ids })
                                                    }
                                                    multiSelect={true}
                                                />
                                                <p className="text-[11px] text-muted-foreground">
                                                    Select stores to search. Create stores in the Documents page.
                                                </p>
                                            </div>

                                            {/* Legacy: Gemini File API picker (backward compat) */}
                                            {!(config.geminiStoreIds?.length) && geminiDocuments.length > 0 && (
                                                <div className="space-y-2 border-t pt-3">
                                                    <Label className="text-xs text-muted-foreground">
                                                        Legacy Gemini Files ({geminiDocuments.length})
                                                    </Label>
                                                    <div className="grid gap-2 max-h-40 overflow-y-auto p-1">
                                                        {geminiDocuments.map((doc) => {
                                                            const metadata = doc.metadata as Record<string, unknown> | null;
                                                            const geminiFile = metadata?.geminiFile as { name?: string } | undefined;
                                                            const fileId = geminiFile?.name;
                                                            if (!fileId) return null;
                                                            const isSelected = (config.geminiFileIds || []).includes(fileId);
                                                            return (
                                                                <button
                                                                    key={doc.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const current = config.geminiFileIds || [];
                                                                        const updated = isSelected
                                                                            ? current.filter((id) => id !== fileId)
                                                                            : [...current, fileId];
                                                                        updateConfig({ geminiFileIds: updated });
                                                                    }}
                                                                    className={cn(
                                                                        "flex items-center justify-between p-2.5 rounded-lg border transition-all",
                                                                        isSelected
                                                                            ? "border-orange-500 bg-orange-500/5"
                                                                            : "border-border hover:border-orange-500/50"
                                                                    )}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium text-sm truncate max-w-[240px]">
                                                                            {doc.filename}
                                                                        </span>
                                                                        <Badge variant="secondary" className="text-[10px]">
                                                                            Legacy
                                                                        </Badge>
                                                                    </div>
                                                                    {isSelected && (
                                                                        <Check className="h-4 w-4 text-orange-500" />
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Legacy files expire after 48 hours. Use Gemini Stores above for persistent storage.
                                                    </p>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </div>
                            </SettingsSection>

                            {/* Tools */}
                            <SettingsSection
                                title="Tools"
                                description="Enable AI tool usage"
                                icon={Wrench}
                                accentColor="primary"
                            >
                                <div className="space-y-4">
                                    <ToggleRow
                                        label="Enable Tools"
                                        description="Allow AI to use web search, calculator, etc."
                                        checked={config.toolsEnabled ?? false}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ toolsEnabled: checked })
                                        }
                                    />

                                    {config.toolsEnabled && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            className="pt-2 space-y-3"
                                        >
                                            <div>
                                                <Label className="text-xs text-muted-foreground mb-2 block">
                                                    Cloud Tools
                                                </Label>
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { id: "web_search", label: "Web Search", icon: "🔍" },
                                                        { id: "calculator", label: "Calculator", icon: "🧮" },
                                                        { id: "rag_search", label: "Doc Search", icon: "📄" },
                                                        { id: "url_fetch", label: "URL Fetch", icon: "🌐" },
                                                        { id: "json_processor", label: "JSON", icon: "📋" },
                                                    ].map((tool) => {
                                                        const enabled = !config.enabledTools?.length ||
                                                            config.enabledTools.includes(tool.id);
                                                        return (
                                                            <button
                                                                key={tool.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    const allCloudTools = [
                                                                        "web_search", "calculator",
                                                                        "rag_search", "url_fetch", "json_processor",
                                                                    ];
                                                                    const current = config.enabledTools || [];
                                                                    let updated: string[];
                                                                    if (current.length === 0) {
                                                                        // All enabled, start excluding this one
                                                                        updated = allCloudTools.filter((t) => t !== tool.id);
                                                                    } else if (enabled) {
                                                                        updated = current.filter((t) => t !== tool.id);
                                                                    } else {
                                                                        updated = [...current, tool.id];
                                                                    }
                                                                    updateConfig({ enabledTools: updated });
                                                                }}
                                                                className={cn(
                                                                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                                                    enabled
                                                                        ? "bg-primary/10 border-primary/30 text-primary"
                                                                        : "bg-muted/50 border-border text-muted-foreground"
                                                                )}
                                                            >
                                                                {tool.icon} {tool.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="text-xs text-muted-foreground mb-2 block">
                                                    Local Access Tools
                                                    <span className="ml-1 text-amber-500">(requires admin)</span>
                                                </Label>
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { id: "file_read", label: "File Read", icon: "📖" },
                                                        { id: "file_write", label: "File Write", icon: "✏️" },
                                                        { id: "file_list", label: "File List", icon: "📂" },
                                                        { id: "file_search", label: "File Search", icon: "🔎" },
                                                        { id: "file_delete", label: "File Delete", icon: "🗑️" },
                                                        { id: "file_move", label: "File Move", icon: "📁" },
                                                        { id: "shell_exec", label: "Shell Exec", icon: "💻" },
                                                    ].map((tool) => (
                                                        <span
                                                            key={tool.id}
                                                            className="px-3 py-1.5 rounded-full text-xs font-medium border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 cursor-default"
                                                            title="Controlled by admin settings (Local File Access / Command Execution)"
                                                        >
                                                            {tool.icon} {tool.label}
                                                        </span>
                                                    ))}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground mt-1">
                                                    These tools are automatically available when enabled in Admin Settings. They cannot be toggled per-channel.
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </SettingsSection>

                            {/* Skills */}
                            <SettingsSection
                                title="Skills"
                                description="Enable plugins and skills"
                                icon={Zap}
                                accentColor="purple"
                            >
                                <div className="space-y-4">
                                    <ToggleRow
                                        label="Enable Skills"
                                        description="Allow AI to use your enabled skills"
                                        checked={config.skillsEnabled ?? false}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ skillsEnabled: checked })
                                        }
                                    />

                                    {config.skillsEnabled && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            className="pt-2"
                                        >
                                            <Label className="text-xs text-muted-foreground mb-2 block">
                                                Available Skills
                                            </Label>
                                            <div className="flex flex-wrap gap-2">
                                                {enabledUserSkills.map((skill) => {
                                                    const enabled = !config.enabledSkills?.length ||
                                                        config.enabledSkills.includes(skill.slug);
                                                    return (
                                                        <button
                                                            key={skill.id}
                                                            type="button"
                                                            onClick={() => {
                                                                const current = config.enabledSkills || [];
                                                                let updated: string[];
                                                                if (current.length === 0) {
                                                                    updated = enabledUserSkills
                                                                        .map(s => s.slug)
                                                                        .filter((s) => s !== skill.slug);
                                                                } else if (enabled) {
                                                                    updated = current.filter((s) => s !== skill.slug);
                                                                } else {
                                                                    updated = [...current, skill.slug];
                                                                }
                                                                updateConfig({ enabledSkills: updated });
                                                            }}
                                                            className={cn(
                                                                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                                                enabled
                                                                    ? "bg-purple-500/10 border-purple-500/30 text-purple-600"
                                                                    : "bg-muted/50 border-border text-muted-foreground"
                                                            )}
                                                        >
                                                            {skill.name}
                                                        </button>
                                                    );
                                                })}
                                                {enabledUserSkills.length === 0 && (
                                                    <p className="text-sm text-muted-foreground">
                                                        No skills enabled yet. Enable skills in Settings → Skills.
                                                    </p>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </SettingsSection>

                            {/* Memory */}
                            <SettingsSection
                                title="Memory"
                                description="Auto-save conversations to Gemini memory"
                                icon={Brain}
                                accentColor="purple"
                            >
                                <ToggleRow
                                    label="Memory Auto-Save"
                                    description="Save conversations to Gemini memory store after each exchange"
                                    checked={config.memoryEnabled ?? false}
                                    onCheckedChange={(checked) =>
                                        updateConfig({ memoryEnabled: checked })
                                    }
                                />
                            </SettingsSection>

                            {/* Voice & Media */}
                            <SettingsSection
                                title="Voice & Media"
                                description="Audio and vision capabilities"
                                icon={Mic}
                                accentColor="cyan"
                            >
                                <div className="space-y-3">
                                    <ToggleRow
                                        label="Vision"
                                        description="Analyze images in messages"
                                        checked={config.visionEnabled ?? true}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ visionEnabled: checked })
                                        }
                                    />
                                    <ToggleRow
                                        label="Speech-to-Text"
                                        description="Transcribe voice messages"
                                        checked={config.sttEnabled ?? false}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ sttEnabled: checked })
                                        }
                                    />
                                    <ToggleRow
                                        label="Text-to-Speech"
                                        description="Send voice responses"
                                        checked={config.ttsEnabled ?? false}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ ttsEnabled: checked })
                                        }
                                    />

                                    {config.ttsEnabled && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="pt-2"
                                        >
                                            <Label className="text-xs text-muted-foreground mb-2 block">
                                                TTS Voice
                                            </Label>
                                            <Select
                                                value={config.ttsVoice || "alloy"}
                                                onValueChange={(value) =>
                                                    updateConfig({ ttsVoice: value })
                                                }
                                            >
                                                <SelectTrigger className="h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {["alloy", "echo", "fable", "onyx", "nova", "shimmer"].map(
                                                        (voice) => (
                                                            <SelectItem key={voice} value={voice}>
                                                                {voice.charAt(0).toUpperCase() + voice.slice(1)}
                                                            </SelectItem>
                                                        )
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </motion.div>
                                    )}
                                </div>
                            </SettingsSection>

                            {/* Advanced */}
                            <SettingsSection
                                title="Advanced"
                                description="System prompt and other settings"
                                icon={Settings2}
                            >
                                <div className="space-y-4">
                                    <ToggleRow
                                        label="Include Channel Context"
                                        description="Add channel info to system prompt"
                                        checked={config.includeChannelContext ?? true}
                                        onCheckedChange={(checked) =>
                                            updateConfig({ includeChannelContext: checked })
                                        }
                                    />

                                    <div>
                                        <Label className="text-xs text-muted-foreground mb-2 block">
                                            Custom System Prompt
                                        </Label>
                                        <textarea
                                            value={config.systemPrompt || ""}
                                            onChange={(e) =>
                                                updateConfig({ systemPrompt: e.target.value || undefined })
                                            }
                                            placeholder="Override the default system prompt..."
                                            className="w-full h-24 px-3 py-2 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        />
                                    </div>
                                </div>
                            </SettingsSection>
                        </div>
                    )}
                </ScrollArea>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-card/50 backdrop-blur-sm flex items-center justify-between gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        disabled={saving}
                        className="text-muted-foreground"
                    >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset
                    </Button>

                    <div className="flex items-center gap-2">
                        <AnimatePresence>
                            {hasChanges && (
                                <motion.span
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    className="text-xs text-amber-500 flex items-center gap-1"
                                >
                                    <AlertCircle className="h-3 w-3" />
                                    Unsaved changes
                                </motion.span>
                            )}
                        </AnimatePresence>

                        <Button
                            onClick={handleSave}
                            disabled={saving || !hasChanges}
                            className="min-w-[100px]"
                        >
                            {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Save
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
