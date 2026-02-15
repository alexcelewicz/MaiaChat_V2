"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, Mail, Link2, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ImportStatus = "idle" | "uploading" | "processing" | "success" | "error";

export default function CrmImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState("");
  const [gmailSyncing, setGmailSyncing] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".csv")) {
      setCsvFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
    }
  }, []);

  async function handleCsvUpload() {
    if (!csvFile) return;

    setImportStatus("uploading");
    setImportProgress(10);
    setImportMessage("Reading CSV file...");

    try {
      const text = await csvFile.text();
      setImportProgress(30);
      setImportStatus("processing");
      setImportMessage("Importing contacts...");

      // Parse CSV into rows
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        setImportStatus("error");
        setImportMessage("CSV file is empty or has no data rows.");
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const contacts = lines.slice(1).map((line) => {
        const values = line.split(",").map((v) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = values[i] ?? "";
        });
        return obj;
      });

      setImportProgress(50);

      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: true, contacts }),
      });

      setImportProgress(90);

      if (res.ok) {
        const data = await res.json();
        const importedCount = Number(data.imported ?? 0);
        const skippedCount = Number(data.skippedDuplicate ?? 0) + Number(data.skippedInvalid ?? 0);
        setImportProgress(100);
        setImportStatus("success");
        setImportMessage(
          `Imported ${importedCount} contacts${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}.`
        );
      } else {
        setImportStatus("error");
        setImportMessage("Import failed. Please check your CSV format and try again.");
      }
    } catch {
      setImportStatus("error");
      setImportMessage("An error occurred during import.");
    }
  }

  async function handleGmailSync() {
    setGmailSyncing(true);
    try {
      const res = await fetch("/api/crm/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "gmail" }),
      });
      if (res.ok) {
        const data = await res.json();
        const gmail = data?.results?.gmail;
        const created = gmail?.contactsCreated ?? 0;
        const interactions = gmail?.interactionsLogged ?? 0;
        setImportMessage(
          `Gmail sync complete. ${created} contact(s) created, ${interactions} interaction(s) logged.`
        );
        setImportStatus("success");
      } else {
        const data = await res.json().catch(() => ({}));
        setImportMessage(data.error || "Gmail sync failed. Please check your connection.");
        setImportStatus("error");
      }
    } catch {
      setImportMessage("An error occurred during Gmail sync.");
      setImportStatus("error");
    } finally {
      setGmailSyncing(false);
    }
  }

  function resetUpload() {
    setCsvFile(null);
    setImportStatus("idle");
    setImportProgress(0);
    setImportMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Import Contacts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import contacts from CSV files or sync from external services.
        </p>
      </div>

      {/* CSV Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            CSV Upload
          </CardTitle>
          <CardDescription>
            Upload a CSV file with columns: name, email, phone, company, role, tags
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {csvFile ? csvFile.name : "Drop a CSV file here or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">CSV files only</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Progress */}
          {importStatus !== "idle" && (
            <div className="space-y-2">
              <Progress value={importProgress} />
              <div className="flex items-center gap-2 text-sm">
                {importStatus === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {importStatus === "error" && (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                <span
                  className={cn(
                    importStatus === "success" && "text-green-600",
                    importStatus === "error" && "text-destructive"
                  )}
                >
                  {importMessage}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleCsvUpload}
              disabled={!csvFile || importStatus === "uploading" || importStatus === "processing"}
            >
              {importStatus === "uploading" || importStatus === "processing"
                ? "Importing..."
                : "Import CSV"}
            </Button>
            {(csvFile || importStatus !== "idle") && (
              <Button variant="outline" onClick={resetUpload}>
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* External Syncs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Gmail Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" />
              Gmail Sync
            </CardTitle>
            <CardDescription>
              Import contacts from your Gmail account by analyzing your recent conversations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGmailSync} disabled={gmailSyncing} variant="outline">
              {gmailSyncing ? "Syncing..." : "Sync from Gmail"}
            </Button>
          </CardContent>
        </Card>

        {/* HubSpot Sync */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" />
              HubSpot Sync
              <Badge variant="secondary" className="text-[10px]">
                Coming Soon
              </Badge>
            </CardTitle>
            <CardDescription>
              Sync contacts from your HubSpot CRM account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              Connect HubSpot
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
