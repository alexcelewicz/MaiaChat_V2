"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    User,
    Briefcase,
    Heart,
    MessageSquare,
    Trash2,
    Loader2,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Shield,
    UserX,
    Brain,
    Info,
    PenLine,
    Save,
    FileText,
    Clock,
    Plus,
    X,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface UserFact {
    text: string;
    category: string;
    confidence: string;
    learnedAt: string;
    source?: string;
}

interface ProfileData {
    basicInfo: {
        name?: string;
        nickname?: string;
        location?: string;
        timezone?: string;
        language?: string;
    };
    professional: {
        occupation?: string;
        company?: string;
    };
    interests: {
        interests?: string[];
        hobbies?: string[];
    };
    preferences: {
        communicationStyle?: string;
        preferredName?: string;
        topics_to_avoid?: string[];
    };
    facts: UserFact[];
}

interface ProfileMetadata {
    createdAt: string;
    updatedAt: string;
    version: number;
    totalFacts: number;
}

interface MemoryEntry {
    id: string;
    conversationId: string;
    title: string;
    timestamp: string;
    summary: string;
}

interface MemoryInfo {
    info: {
        exists: boolean;
        entryCount: number;
        totalSize: number;
    };
    recentEntries: MemoryEntry[];
    totalEntries: number;
    totalSize: number;
}

interface UserProvidedForm {
    name: string;
    location: string;
    timezone: string;
    occupation: string;
    company: string;
    interests: string;
    hobbies: string;
    communicationStyle: string;
    customInstructions: string;
    facts: string[];
}

export default function MyDataPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [metadata, setMetadata] = useState<ProfileMetadata | null>(null);
    const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
    const [profileMemoryEnabled, setProfileMemoryEnabled] = useState(true);
    const [isDeletingFact, setIsDeletingFact] = useState<string | null>(null);
    const [isClearingProfile, setIsClearingProfile] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState("");
    const [deletionPreview, setDeletionPreview] = useState<Record<string, unknown> | null>(null);
    const [sectionsOpen, setSectionsOpen] = useState({
        basic: true,
        professional: true,
        interests: true,
        facts: true,
        memory: true,
        tellAboutYourself: false,
    });

    // User-provided info form
    const [userForm, setUserForm] = useState<UserProvidedForm>({
        name: "",
        location: "",
        timezone: "",
        occupation: "",
        company: "",
        interests: "",
        hobbies: "",
        communicationStyle: "",
        customInstructions: "",
        facts: [],
    });
    const [newFact, setNewFact] = useState("");
    const [isSavingForm, setIsSavingForm] = useState(false);

    const fetchProfileData = async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/user/profile?includeMemory=true");
            if (!response.ok) throw new Error("Failed to fetch profile");
            const data = await response.json();
            setProfileData(data.dataCategories);
            setMetadata(data.metadata);
            if (data.memory && !data.memory.error) {
                setMemoryInfo(data.memory);
            }
        } catch (error) {
            console.error("Fetch profile error:", error);
            toast.error("Failed to load profile data");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDeletionPreview = async () => {
        try {
            const response = await fetch("/api/user/delete-account");
            if (!response.ok) throw new Error("Failed to fetch deletion preview");
            const data = await response.json();
            setDeletionPreview(data.dataToBeDeleted);
        } catch (error) {
            console.error("Fetch deletion preview error:", error);
        }
    };

    useEffect(() => {
        fetchProfileData();
        fetchDeletionPreview();
    }, []);

    const handleDeleteFact = async (factText: string) => {
        try {
            setIsDeletingFact(factText);
            const response = await fetch(`/api/user/profile?factText=${encodeURIComponent(factText)}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete fact");
            }

            toast.success("Fact deleted");
            fetchProfileData();
        } catch (error) {
            console.error("Delete fact error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to delete fact");
        } finally {
            setIsDeletingFact(null);
        }
    };

    const handleClearField = async (field: string) => {
        try {
            const response = await fetch(`/api/user/profile?field=${field}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to clear data");
            }

            toast.success(`${field} data cleared`);
            fetchProfileData();
        } catch (error) {
            console.error("Clear field error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to clear data");
        }
    };

    const handleClearAllProfile = async () => {
        try {
            setIsClearingProfile(true);
            const response = await fetch("/api/user/profile?clearAll=true", {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to clear profile");
            }

            toast.success("All profile data deleted");
            fetchProfileData();
        } catch (error) {
            console.error("Clear profile error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to clear profile");
        } finally {
            setIsClearingProfile(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmation !== "DELETE MY ACCOUNT") {
            toast.error("Please type 'DELETE MY ACCOUNT' to confirm");
            return;
        }

        try {
            setIsDeletingAccount(true);
            const response = await fetch("/api/user/delete-account", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmation: deleteConfirmation }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to delete account");
            }

            toast.success("Account deleted. Redirecting...");
            // Redirect to home after successful deletion
            setTimeout(() => {
                window.location.href = "/";
            }, 2000);
        } catch (error) {
            console.error("Delete account error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to delete account");
        } finally {
            setIsDeletingAccount(false);
        }
    };

    const handleSaveUserInfo = async () => {
        try {
            setIsSavingForm(true);

            // Prepare the data
            const infoToSave: Record<string, unknown> = {};
            if (userForm.name.trim()) infoToSave.name = userForm.name.trim();
            if (userForm.location.trim()) infoToSave.location = userForm.location.trim();
            if (userForm.timezone.trim()) infoToSave.timezone = userForm.timezone.trim();
            if (userForm.occupation.trim()) infoToSave.occupation = userForm.occupation.trim();
            if (userForm.company.trim()) infoToSave.company = userForm.company.trim();
            if (userForm.interests.trim()) {
                infoToSave.interests = userForm.interests.split(",").map((s) => s.trim()).filter(Boolean);
            }
            if (userForm.hobbies.trim()) {
                infoToSave.hobbies = userForm.hobbies.split(",").map((s) => s.trim()).filter(Boolean);
            }
            if (userForm.communicationStyle.trim()) infoToSave.communicationStyle = userForm.communicationStyle.trim();
            if (userForm.customInstructions.trim()) infoToSave.customInstructions = userForm.customInstructions.trim();
            if (userForm.facts.length > 0) infoToSave.facts = userForm.facts;

            if (Object.keys(infoToSave).length === 0) {
                toast.error("Please fill in at least one field");
                return;
            }

            const response = await fetch("/api/user/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(infoToSave),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to save");
            }

            toast.success("Information saved! Agents will now use this context.");

            // Clear the form
            setUserForm({
                name: "",
                location: "",
                timezone: "",
                occupation: "",
                company: "",
                interests: "",
                hobbies: "",
                communicationStyle: "",
                customInstructions: "",
                facts: [],
            });

            // Refresh profile data
            fetchProfileData();
        } catch (error) {
            console.error("Save user info error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to save information");
        } finally {
            setIsSavingForm(false);
        }
    };

    const handleAddFact = () => {
        if (newFact.trim() && !userForm.facts.includes(newFact.trim())) {
            setUserForm((prev) => ({
                ...prev,
                facts: [...prev.facts, newFact.trim()],
            }));
            setNewFact("");
        }
    };

    const handleRemoveFact = (factToRemove: string) => {
        setUserForm((prev) => ({
            ...prev,
            facts: prev.facts.filter((f) => f !== factToRemove),
        }));
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return "Unknown";
        return new Date(dateStr).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const hasAnyData = profileData && (
        profileData.basicInfo?.name ||
        profileData.basicInfo?.location ||
        profileData.basicInfo?.timezone ||
        profileData.professional?.occupation ||
        profileData.interests?.interests?.length ||
        profileData.facts?.length > 0
    );

    const toggleSection = (section: keyof typeof sectionsOpen) => {
        setSectionsOpen((prev) => ({ ...prev, [section]: !prev[section] }));
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">My Data</h1>
                <p className="text-muted-foreground mt-1">
                    View and manage personal information that AI agents have learned about you
                </p>
            </div>

            {/* GDPR Info Banner */}
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
                <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                        <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-medium text-blue-800 dark:text-blue-200">Your Data, Your Control</p>
                            <p className="text-blue-700 dark:text-blue-300 mt-1">
                                Under GDPR and data protection laws, you have the right to access, correct, and delete your personal data.
                                All data shown here was automatically learned by AI agents during your conversations.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Profile Memory Toggle */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5" />
                        Profile Learning
                    </CardTitle>
                    <CardDescription>
                        Control whether AI agents automatically learn personal information from your conversations
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="profile-memory">Allow Profile Learning</Label>
                            <p className="text-sm text-muted-foreground">
                                When enabled, agents will remember your name, location, interests, and other personal details
                            </p>
                        </div>
                        <Switch
                            id="profile-memory"
                            checked={profileMemoryEnabled}
                            onCheckedChange={setProfileMemoryEnabled}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Tell Agents About Yourself */}
            <Card>
                <CardHeader>
                    <Collapsible open={sectionsOpen.tellAboutYourself} onOpenChange={() => toggleSection("tellAboutYourself")}>
                        <CollapsibleTrigger className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <PenLine className="h-5 w-5" />
                                <CardTitle className="cursor-pointer">Tell Agents About Yourself</CardTitle>
                            </div>
                            {sectionsOpen.tellAboutYourself ? (
                                <ChevronUp className="h-5 w-5" />
                            ) : (
                                <ChevronDown className="h-5 w-5" />
                            )}
                        </CollapsibleTrigger>
                        <CardDescription className="mt-2">
                            Provide information you want all AI agents to know about you
                        </CardDescription>
                        <CollapsibleContent>
                            <div className="mt-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="user-name">Your Name</Label>
                                        <Input
                                            id="user-name"
                                            placeholder="How should agents address you?"
                                            value={userForm.name}
                                            onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="user-location">Location</Label>
                                        <Input
                                            id="user-location"
                                            placeholder="City, Country"
                                            value={userForm.location}
                                            onChange={(e) => setUserForm((prev) => ({ ...prev, location: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="user-timezone">Timezone</Label>
                                        <Input
                                            id="user-timezone"
                                            placeholder="Europe/London"
                                            value={userForm.timezone}
                                            onChange={(e) => setUserForm((prev) => ({ ...prev, timezone: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="user-occupation">Occupation</Label>
                                        <Input
                                            id="user-occupation"
                                            placeholder="What do you do?"
                                            value={userForm.occupation}
                                            onChange={(e) => setUserForm((prev) => ({ ...prev, occupation: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="user-company">Company/Organization</Label>
                                        <Input
                                            id="user-company"
                                            placeholder="Where do you work?"
                                            value={userForm.company}
                                            onChange={(e) => setUserForm((prev) => ({ ...prev, company: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="user-interests">Interests</Label>
                                        <Input
                                            id="user-interests"
                                            placeholder="Technology, Music, Travel (comma-separated)"
                                            value={userForm.interests}
                                            onChange={(e) => setUserForm((prev) => ({ ...prev, interests: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="user-hobbies">Hobbies</Label>
                                        <Input
                                            id="user-hobbies"
                                            placeholder="Reading, Hiking, Gaming (comma-separated)"
                                            value={userForm.hobbies}
                                            onChange={(e) => setUserForm((prev) => ({ ...prev, hobbies: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="user-communication">Communication Style Preference</Label>
                                    <Input
                                        id="user-communication"
                                        placeholder="e.g., casual, formal, concise, detailed"
                                        value={userForm.communicationStyle}
                                        onChange={(e) => setUserForm((prev) => ({ ...prev, communicationStyle: e.target.value }))}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="user-instructions">Custom Instructions for Agents</Label>
                                    <Textarea
                                        id="user-instructions"
                                        placeholder="Any special instructions or context you want agents to always remember..."
                                        value={userForm.customInstructions}
                                        onChange={(e) => setUserForm((prev) => ({ ...prev, customInstructions: e.target.value }))}
                                        className="min-h-[80px]"
                                    />
                                </div>

                                {/* Custom Facts */}
                                <div className="space-y-2">
                                    <Label>Additional Facts About You</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Add any fact (e.g., 'I prefer metric units')"
                                            value={newFact}
                                            onChange={(e) => setNewFact(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    handleAddFact();
                                                }
                                            }}
                                        />
                                        <Button type="button" variant="outline" onClick={handleAddFact}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    {userForm.facts.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {userForm.facts.map((fact, idx) => (
                                                <Badge key={idx} variant="secondary" className="gap-1 pr-1">
                                                    {fact}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveFact(fact)}
                                                        className="ml-1 hover:text-destructive"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <Button
                                    onClick={handleSaveUserInfo}
                                    disabled={isSavingForm}
                                    className="w-full md:w-auto"
                                >
                                    {isSavingForm ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-2" />
                                    )}
                                    Save Information
                                </Button>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </CardHeader>
            </Card>

            {/* Local Conversation Memory */}
            <Card>
                <CardHeader>
                    <Collapsible open={sectionsOpen.memory} onOpenChange={() => toggleSection("memory")}>
                        <CollapsibleTrigger className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <Brain className="h-5 w-5" />
                                <CardTitle className="cursor-pointer">Local Conversation Memory</CardTitle>
                                {memoryInfo && (
                                    <Badge variant="secondary">
                                        {memoryInfo.totalEntries} memories
                                    </Badge>
                                )}
                            </div>
                            {sectionsOpen.memory ? (
                                <ChevronUp className="h-5 w-5" />
                            ) : (
                                <ChevronDown className="h-5 w-5" />
                            )}
                        </CollapsibleTrigger>
                        <CardDescription className="mt-2">
                            Summaries of your recent conversations stored locally
                        </CardDescription>
                        <CollapsibleContent>
                            <div className="mt-4 space-y-4">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : !memoryInfo || memoryInfo.totalEntries === 0 ? (
                                    <div className="text-center py-6 text-muted-foreground">
                                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p>No conversation memories stored yet.</p>
                                        <p className="text-sm mt-1">
                                            Memories are created when conversations end with Memory enabled.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Stats */}
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <FileText className="h-4 w-4" />
                                                <span>{memoryInfo.totalEntries} entries</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Info className="h-4 w-4" />
                                                <span>{formatBytes(memoryInfo.totalSize)} total</span>
                                            </div>
                                        </div>

                                        {/* Memory Entries */}
                                        <ScrollArea className="h-[300px] border rounded-lg">
                                            <div className="divide-y">
                                                {memoryInfo.recentEntries.map((entry) => (
                                                    <div key={entry.id} className="p-3 hover:bg-muted/30">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <p className="font-medium truncate">
                                                                    {entry.title || "Untitled Conversation"}
                                                                </p>
                                                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                                                    {entry.summary || "No summary available"}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                                                                <Clock className="h-3 w-3" />
                                                                {formatDate(entry.timestamp)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>

                                        {/* Link to full memory management */}
                                        <div className="flex items-center justify-between pt-2">
                                            <p className="text-sm text-muted-foreground">
                                                View and manage Gemini memory store
                                            </p>
                                            <Link href="/settings/memory">
                                                <Button variant="outline" size="sm">
                                                    Manage All Memories
                                                </Button>
                                            </Link>
                                        </div>
                                    </>
                                )}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </CardHeader>
            </Card>

            {/* Profile Data */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        What Agents Know About You
                    </CardTitle>
                    <CardDescription>
                        Information automatically extracted from your conversations
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : !hasAnyData ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No personal information stored yet.</p>
                            <p className="text-sm mt-1">
                                AI agents learn about you during conversations when Memory is enabled.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Basic Info Section */}
                            {(profileData.basicInfo?.name || profileData.basicInfo?.location || profileData.basicInfo?.timezone) && (
                                <Collapsible open={sectionsOpen.basic} onOpenChange={() => toggleSection("basic")}>
                                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/30 hover:bg-muted/50">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            <span className="font-medium">Basic Information</span>
                                        </div>
                                        {sectionsOpen.basic ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="mt-2 space-y-2">
                                        {profileData.basicInfo?.name && (
                                            <div className="flex items-center justify-between p-3 rounded-lg border">
                                                <div>
                                                    <span className="text-sm text-muted-foreground">Name</span>
                                                    <p className="font-medium">{profileData.basicInfo.name}</p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleClearField("name")}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                        {profileData.basicInfo?.location && (
                                            <div className="flex items-center justify-between p-3 rounded-lg border">
                                                <div>
                                                    <span className="text-sm text-muted-foreground">Location</span>
                                                    <p className="font-medium">{profileData.basicInfo.location}</p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleClearField("location")}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                        {profileData.basicInfo?.timezone && (
                                            <div className="flex items-center justify-between p-3 rounded-lg border">
                                                <div>
                                                    <span className="text-sm text-muted-foreground">Timezone</span>
                                                    <p className="font-medium">{profileData.basicInfo.timezone}</p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleClearField("timezone")}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </CollapsibleContent>
                                </Collapsible>
                            )}

                            {/* Professional Section */}
                            {profileData.professional?.occupation && (
                                <Collapsible open={sectionsOpen.professional} onOpenChange={() => toggleSection("professional")}>
                                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/30 hover:bg-muted/50">
                                        <div className="flex items-center gap-2">
                                            <Briefcase className="h-4 w-4" />
                                            <span className="font-medium">Professional</span>
                                        </div>
                                        {sectionsOpen.professional ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="mt-2">
                                        <div className="flex items-center justify-between p-3 rounded-lg border">
                                            <div>
                                                <span className="text-sm text-muted-foreground">Occupation</span>
                                                <p className="font-medium">{profileData.professional.occupation}</p>
                                                {profileData.professional.company && (
                                                    <p className="text-sm text-muted-foreground">
                                                        at {profileData.professional.company}
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleClearField("occupation")}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            )}

                            {/* Interests Section */}
                            {(profileData.interests?.interests?.length || profileData.interests?.hobbies?.length) && (
                                <Collapsible open={sectionsOpen.interests} onOpenChange={() => toggleSection("interests")}>
                                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/30 hover:bg-muted/50">
                                        <div className="flex items-center gap-2">
                                            <Heart className="h-4 w-4" />
                                            <span className="font-medium">Interests & Hobbies</span>
                                        </div>
                                        {sectionsOpen.interests ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="mt-2">
                                        <div className="flex items-center justify-between p-3 rounded-lg border">
                                            <div className="flex flex-wrap gap-2">
                                                {profileData.interests?.interests?.map((interest, i) => (
                                                    <Badge key={i} variant="secondary">{interest}</Badge>
                                                ))}
                                                {profileData.interests?.hobbies?.map((hobby, i) => (
                                                    <Badge key={`h-${i}`} variant="outline">{hobby}</Badge>
                                                ))}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleClearField("interests")}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            )}

                            {/* Learned Facts Section */}
                            {profileData.facts?.length > 0 && (
                                <Collapsible open={sectionsOpen.facts} onOpenChange={() => toggleSection("facts")}>
                                    <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border bg-muted/30 hover:bg-muted/50">
                                        <div className="flex items-center gap-2">
                                            <MessageSquare className="h-4 w-4" />
                                            <span className="font-medium">Learned Facts</span>
                                            <Badge variant="secondary">{profileData.facts.length}</Badge>
                                        </div>
                                        {sectionsOpen.facts ? (
                                            <ChevronUp className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="mt-2 space-y-2">
                                        {profileData.facts.map((fact, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between p-3 rounded-lg border"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium">{fact.text}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge
                                                            variant="outline"
                                                            className={
                                                                fact.confidence === "high"
                                                                    ? "text-green-600 border-green-300"
                                                                    : fact.confidence === "medium"
                                                                        ? "text-yellow-600 border-yellow-300"
                                                                        : "text-gray-500"
                                                            }
                                                        >
                                                            {fact.confidence} confidence
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDate(fact.learnedAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive flex-shrink-0"
                                                    disabled={isDeletingFact === fact.text}
                                                    onClick={() => handleDeleteFact(fact.text)}
                                                >
                                                    {isDeletingFact === fact.text ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </div>
                                        ))}
                                    </CollapsibleContent>
                                </Collapsible>
                            )}

                            <Separator className="my-4" />

                            {/* Clear All Profile Data */}
                            <div className="flex items-center justify-between p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30">
                                <div>
                                    <p className="font-medium text-orange-800 dark:text-orange-200">
                                        Clear All Profile Data
                                    </p>
                                    <p className="text-sm text-orange-700 dark:text-orange-300">
                                        Delete all personal information learned by AI agents
                                    </p>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300"
                                            disabled={isClearingProfile}
                                        >
                                            {isClearingProfile ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            ) : (
                                                <Trash2 className="h-4 w-4 mr-2" />
                                            )}
                                            Clear All
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Clear All Profile Data</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete all personal information that AI agents have learned about you.
                                                This includes your name, location, occupation, interests, and all learned facts.
                                                This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={handleClearAllProfile}
                                                className="bg-orange-600 text-white hover:bg-orange-700"
                                            >
                                                Clear All Profile Data
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Metadata */}
            {metadata && metadata.version > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5" />
                            Data Metadata
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <span className="text-muted-foreground">First learned</span>
                                <p className="font-medium">{formatDate(metadata.createdAt)}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Last updated</span>
                                <p className="font-medium">{formatDate(metadata.updatedAt)}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Total facts</span>
                                <p className="font-medium">{metadata.totalFacts}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Profile version</span>
                                <p className="font-medium">v{metadata.version}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Delete Account - Danger Zone */}
            <Card className="border-red-200 dark:border-red-800">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <UserX className="h-5 w-5" />
                        Delete Account
                    </CardTitle>
                    <CardDescription>
                        Permanently delete your account and all associated data
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground space-y-2">
                        <p>This action will permanently delete:</p>
                        {deletionPreview && (
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>{Number(deletionPreview.conversations) || 0} conversations</li>
                                <li>{Number(deletionPreview.messages) || 0} messages</li>
                                <li>{Number(deletionPreview.apiKeys) || 0} API keys</li>
                                <li>{Number(deletionPreview.channelConnections) || 0} channel connections</li>
                                <li>All profile data and learned facts</li>
                                <li>All conversation memories</li>
                            </ul>
                        )}
                    </div>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">
                                <UserX className="h-4 w-4 mr-2" />
                                Delete My Account
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Account</AlertDialogTitle>
                                <AlertDialogDescription className="space-y-3">
                                    <p>
                                        This will permanently delete your account and all associated data.
                                        This action cannot be undone.
                                    </p>
                                    <p className="font-medium">
                                        Type <code className="bg-muted px-1 rounded">DELETE MY ACCOUNT</code> to confirm:
                                    </p>
                                    <Input
                                        value={deleteConfirmation}
                                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                                        placeholder="Type here to confirm"
                                        className="font-mono"
                                    />
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeleteConfirmation("")}>
                                    Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDeleteAccount}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={deleteConfirmation !== "DELETE MY ACCOUNT" || isDeletingAccount}
                                >
                                    {isDeletingAccount ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Deleting...
                                        </>
                                    ) : (
                                        "Delete Account Forever"
                                    )}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>
        </div>
    );
}
