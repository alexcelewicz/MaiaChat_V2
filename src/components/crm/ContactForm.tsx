"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  relationship: "colleague" | "client" | "prospect" | "friend" | "family";
  importance: "critical" | "high" | "normal" | "low";
  tags: string;
  notes: string;
}

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Partial<ContactFormData>;
  onSubmit: (data: ContactFormData) => void;
  isLoading?: boolean;
}

const defaultFormData: ContactFormData = {
  name: "",
  email: "",
  phone: "",
  company: "",
  role: "",
  relationship: "colleague",
  importance: "normal",
  tags: "",
  notes: "",
};

export function ContactForm({
  open,
  onOpenChange,
  initialData,
  onSubmit,
  isLoading,
}: ContactFormProps) {
  const [form, setForm] = useState<ContactFormData>({ ...defaultFormData, ...initialData });

  const isEdit = Boolean(initialData?.name);

  useEffect(() => {
    if (open) {
      setForm({ ...defaultFormData, ...initialData });
    }
  }, [open, initialData]);

  function handleChange(field: keyof ContactFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Contact" : "Add Contact"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the contact details below."
              : "Fill in the details to add a new contact."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name (required) */}
          <div className="space-y-2">
            <Label htmlFor="cf-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cf-name"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cf-email">Email</Label>
              <Input
                id="cf-email"
                type="email"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-phone">Phone</Label>
              <Input
                id="cf-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="+1 555-0123"
              />
            </div>
          </div>

          {/* Company & Role */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cf-company">Company</Label>
              <Input
                id="cf-company"
                value={form.company}
                onChange={(e) => handleChange("company", e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-role">Role</Label>
              <Input
                id="cf-role"
                value={form.role}
                onChange={(e) => handleChange("role", e.target.value)}
                placeholder="Product Manager"
              />
            </div>
          </div>

          {/* Relationship & Importance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select
                value={form.relationship}
                onValueChange={(v) =>
                  handleChange("relationship", v as ContactFormData["relationship"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="colleague">Colleague</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="friend">Friend</SelectItem>
                  <SelectItem value="family">Family</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Importance</Label>
              <Select
                value={form.importance}
                onValueChange={(v) =>
                  handleChange("importance", v as ContactFormData["importance"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="cf-tags">Tags</Label>
            <Input
              id="cf-tags"
              value={form.tags}
              onChange={(e) => handleChange("tags", e.target.value)}
              placeholder="vip, sales, partner (comma-separated)"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="cf-notes">Notes</Label>
            <Textarea
              id="cf-notes"
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Any additional notes..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !form.name.trim()}>
              {isLoading ? "Saving..." : isEdit ? "Update Contact" : "Add Contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
