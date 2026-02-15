"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactCard } from "@/components/crm/ContactCard";
import { ContactForm, type ContactFormData } from "@/components/crm/ContactForm";
import { MorningBriefingCard } from "@/components/crm/MorningBriefingCard";
import { Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  company?: string;
  role?: string;
  importance: "critical" | "high" | "normal" | "low";
  relationshipScore: number;
  tags: string[];
  email?: string;
  avatarUrl?: string;
  relationship?: string;
}

interface Briefing {
  staleContacts: Array<{
    id: string;
    name: string;
    lastContactAt: string | null;
    importance: "critical" | "high" | "normal" | "low";
  }>;
  recentInteractions: Array<{
    id: string;
    type: string;
    subject: string;
    occurredAt: string;
  }>;
  totalContacts: number;
}

export default function CrmPage() {
  const router = useRouter();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [relationshipFilter, setRelationshipFilter] = useState("all");
  const [importanceFilter, setImportanceFilter] = useState("all");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [contactsRes, briefingRes] = await Promise.all([
          fetch("/api/crm/contacts"),
          fetch("/api/crm/briefing"),
        ]);

        if (contactsRes.ok) {
          const data = await contactsRes.json();
          setContacts(data.contacts ?? data ?? []);
        }

        if (briefingRes.ok) {
          const data = await briefingRes.json();
          setBriefing(data.briefing ?? data ?? null);
        }
      } catch (error) {
        console.error("[CRM] Failed to load data:", error);
        toast.error("Failed to load CRM data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.company?.toLowerCase().includes(search.toLowerCase()) ||
        c.role?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase());

      const matchesRelationship =
        relationshipFilter === "all" || c.relationship === relationshipFilter;

      const matchesImportance =
        importanceFilter === "all" || c.importance === importanceFilter;

      return matchesSearch && matchesRelationship && matchesImportance;
    });
  }, [contacts, search, relationshipFilter, importanceFilter]);

  async function handleAddContact(data: ContactFormData) {
    setFormLoading(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
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
        const response = await res.json();
        const newContact = response.contact ?? response;
        setContacts((prev) => [newContact, ...prev]);
        setFormOpen(false);
      }
    } catch (error) {
      console.error("[CRM] Failed to add contact:", error);
      toast.error("Failed to add contact");
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">CRM</h1>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Morning Briefing */}
      {briefing && <MorningBriefingCard briefing={briefing} />}

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="pl-9"
          />
        </div>

        <Select value={relationshipFilter} onValueChange={setRelationshipFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Relationship" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="colleague">Colleague</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="friend">Friend</SelectItem>
            <SelectItem value="family">Family</SelectItem>
          </SelectContent>
        </Select>

        <Select value={importanceFilter} onValueChange={setImportanceFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Importance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Contact Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border bg-muted"
            />
          ))}
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="mb-3 h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">No contacts found</p>
          <p className="mt-1 text-sm">
            {contacts.length === 0
              ? "Add your first contact to get started."
              : "Try adjusting your search or filters."}
          </p>
          {contacts.length === 0 && (
            <Button className="mt-4" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Contact
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={() => router.push(`/crm/${contact.id}`)}
            />
          ))}
        </div>
      )}

      {/* Add Contact Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleAddContact}
        isLoading={formLoading}
      />
    </div>
  );
}
