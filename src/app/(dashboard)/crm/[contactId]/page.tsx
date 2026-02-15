"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactForm, type ContactFormData } from "@/components/crm/ContactForm";
import { InteractionTimeline } from "@/components/crm/InteractionTimeline";
import { RelationshipScoreBar } from "@/components/crm/RelationshipScoreBar";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Plus,
  Mail,
  Phone,
  Building2,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  importance: "critical" | "high" | "normal" | "low";
  relationship?: string;
  relationshipScore: number;
  tags: string[];
  notes?: string;
  avatarUrl?: string;
}

interface Interaction {
  id: string;
  type: "email" | "meeting" | "call" | "chat" | "note";
  subject: string;
  summary?: string;
  channel?: string;
  sentiment?: string;
  occurredAt: string;
}

const importanceColors: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  normal: "bg-blue-500",
  low: "bg-gray-400",
};

const relationshipLabels: Record<string, string> = {
  colleague: "Colleague",
  client: "Client",
  prospect: "Prospect",
  friend: "Friend",
  family: "Family",
};

export default function ContactDetailPage() {
  const router = useRouter();
  const params = useParams();
  const contactId = params.contactId as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  // Log interaction form
  const [logType, setLogType] = useState<Interaction["type"]>("email");
  const [logSubject, setLogSubject] = useState("");
  const [logSummary, setLogSummary] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [contactRes, interactionsRes] = await Promise.all([
          fetch(`/api/crm/contacts/${contactId}`),
          fetch(`/api/crm/interactions?contactId=${contactId}`),
        ]);

        if (contactRes.ok) {
          const data = await contactRes.json();
          setContact(data.contact);
          // Timeline comes from the same endpoint
          if (data.timeline) {
            setInteractions(data.timeline);
          }
        }

        if (interactionsRes.ok) {
          const data = await interactionsRes.json();
          setInteractions(data.interactions ?? []);
        }
      } catch (error) {
        console.error("[CRM] Failed to load contact:", error);
        toast.error("Failed to load contact details");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [contactId]);

  async function handleEdit(data: ContactFormData) {
    setEditLoading(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          tags: data.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setContact(updated.contact);
        setEditOpen(false);
      }
    } catch (error) {
      console.error("[CRM] Failed to edit contact:", error);
      toast.error("Failed to update contact");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/crm");
      }
    } catch (error) {
      console.error("[CRM] Failed to delete contact:", error);
      toast.error("Failed to delete contact");
    }
  }

  async function handleLogInteraction() {
    if (!logSubject.trim()) return;

    setLogLoading(true);
    try {
      const res = await fetch("/api/crm/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          type: logType,
          subject: logSubject,
          summary: logSummary,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newInteraction = data.interaction ?? data;
        setInteractions((prev) => [newInteraction, ...prev]);
        setLogOpen(false);
        setLogType("email");
        setLogSubject("");
        setLogSummary("");
      }
    } catch (error) {
      console.error("[CRM] Failed to log interaction:", error);
      toast.error("Failed to log interaction");
    } finally {
      setLogLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-xl border bg-muted" />
        <div className="h-64 animate-pulse rounded-xl border bg-muted" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-lg text-muted-foreground">Contact not found</p>
        <Button variant="outline" onClick={() => router.push("/crm")}>
          <ArrowLeft className="h-4 w-4" />
          Back to CRM
        </Button>
      </div>
    );
  }

  const contactName = contact.name || "Unknown";
  const contactTags = contact.tags ?? [];

  const initials = contactName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const editInitialData: Partial<ContactFormData> = {
    name: contactName,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    company: contact.company ?? "",
    role: contact.role ?? "",
    relationship: (contact.relationship as ContactFormData["relationship"]) ?? "colleague",
    importance: contact.importance ?? "normal",
    tags: contactTags.join(", "),
    notes: contact.notes ?? "",
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => router.push("/crm")}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to CRM
      </Button>

      {/* Header Card */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white",
                importanceColors[contact.importance]
              )}
            >
              {contact.avatarUrl ? (
                <img
                  src={contact.avatarUrl}
                  alt={contactName}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>

            {/* Name & details */}
            <div>
              <h1 className="text-xl font-bold">{contactName}</h1>

              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {contact.role && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {contact.role}
                  </span>
                )}
                {contact.company && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {contact.company}
                  </span>
                )}
                {contact.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {contact.email}
                  </span>
                )}
                {contact.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {contact.phone}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {contact.relationship && (
                  <Badge variant="outline">
                    {relationshipLabels[contact.relationship] ?? contact.relationship}
                  </Badge>
                )}
                <Badge variant="secondary">{contact.importance}</Badge>
                {contactTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Edit className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive hover:text-white"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Relationship Score */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Relationship Score</CardTitle>
        </CardHeader>
        <CardContent>
          <RelationshipScoreBar score={contact.relationshipScore} />
        </CardContent>
      </Card>

      {/* Tabs: Timeline, Notes, Details */}
      <Tabs defaultValue="timeline">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>

          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="h-4 w-4" />
            Log Interaction
          </Button>
        </div>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardContent>
              <InteractionTimeline interactions={interactions} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardContent>
              {contact.notes ? (
                <p className="whitespace-pre-wrap text-sm">{contact.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No notes yet. Click Edit to add notes.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Name</dt>
                  <dd className="mt-0.5 text-sm">{contactName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                  <dd className="mt-0.5 text-sm">{contact.email || "---"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Phone</dt>
                  <dd className="mt-0.5 text-sm">{contact.phone || "---"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Company</dt>
                  <dd className="mt-0.5 text-sm">{contact.company || "---"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Role</dt>
                  <dd className="mt-0.5 text-sm">{contact.role || "---"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Relationship</dt>
                  <dd className="mt-0.5 text-sm">
                    {contact.relationship
                      ? relationshipLabels[contact.relationship] ?? contact.relationship
                      : "---"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Importance</dt>
                  <dd className="mt-0.5 text-sm capitalize">{contact.importance}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Relationship Score
                  </dt>
                  <dd className="mt-0.5 text-sm">{contact.relationshipScore}/100</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Contact Dialog */}
      <ContactForm
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={editInitialData}
        onSubmit={handleEdit}
        isLoading={editLoading}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {contactName}? This action cannot be undone.
              All interactions and notes associated with this contact will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Log Interaction Dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Interaction</DialogTitle>
            <DialogDescription>
              Record an interaction with {contactName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={logType} onValueChange={(v) => setLogType(v as Interaction["type"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="log-subject">Subject</Label>
              <Input
                id="log-subject"
                value={logSubject}
                onChange={(e) => setLogSubject(e.target.value)}
                placeholder="Meeting about Q3 planning"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="log-summary">Summary</Label>
              <Textarea
                id="log-summary"
                value={logSummary}
                onChange={(e) => setLogSummary(e.target.value)}
                placeholder="Brief summary of the interaction..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)} disabled={logLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleLogInteraction}
              disabled={logLoading || !logSubject.trim()}
            >
              {logLoading ? "Saving..." : "Log Interaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
