import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { Button, Field, Select } from "@/components/ui";
import { parseCsv, downloadCsv } from "@/utils/csv";
import { normalizePhone } from "@/utils/phone";
import { createLeadsBatch, type ImportRow } from "@/lib/data/leads";
import type { LeadDoc, ProgramDoc, LeadSourceDoc, BranchDoc, CampaignDoc, UserDoc, Priority, FollowUpType } from "@/types";
import { X, Upload, FileWarning, FileCheck2, Download } from "lucide-react";

const HEADER_ALIASES: Record<string, string> = {
  "parent name": "parentName",
  "parent/guardian name": "parentName",
  name: "parentName",
  phone: "parentPhone",
  mobile: "parentPhone",
  "phone number": "parentPhone",
  email: "parentEmail",
  "child name": "childName",
  "child's name": "childName",
  "child age": "childAge",
  "child's age": "childAge",
  age: "childAge",
  program: "program",
  course: "program",
  branch: "branch",
  location: "location",
  fees: "fees",
  "fees quoted": "fees",
  source: "source",
  "source channel": "source",
  campaign: "campaign",
  priority: "priority",
  "next follow-up": "nextFollowUpAt",
  "next followup": "nextFollowUpAt",
  "follow-up": "nextFollowUpAt",
  "follow-up type": "nextFollowUpType",
  notes: "notes",
  remarks: "notes",
  "assigned staff": "assignedStaff",
  admin: "assignedStaff",
  staff: "assignedStaff",
};

interface ParsedRow {
  index: number;
  parentName: string;
  childName: string;
  status: "ready" | "error" | "duplicate";
  message: string;
  input?: ImportRow;
}

function findByName<T extends { name: string }>(list: T[], value: string | undefined): T | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  return list.find((item) => item.name.trim().toLowerCase() === v);
}

export function ImportLeadsModal({
  onClose,
  existingLeads,
  programs,
  leadSources,
  branches,
  campaigns,
  users,
  currentUserId,
}: {
  onClose: () => void;
  existingLeads: LeadDoc[];
  programs: ProgramDoc[];
  leadSources: LeadSourceDoc[];
  branches: BranchDoc[];
  campaigns: CampaignDoc[];
  users: UserDoc[];
  currentUserId: string;
}) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultAssignee, setDefaultAssignee] = useState("");

  const downloadTemplate = () => {
    downloadCsv("lead-import-template.csv", [
      {
        "Parent Name": "Kavitha R",
        Phone: "9000000000",
        Email: "",
        "Child Name": "Aarav",
        "Child Age": "4 years",
        Course: programs[0]?.name ?? "Nursery",
        Branch: branches[0]?.name ?? "",
        Location: "Singanallur",
        Fees: "12000",
        Source: leadSources[0]?.name ?? "Walk-in",
        Campaign: "",
        Priority: "Medium",
        "Next Follow-up": "",
        "Follow-up Type": "Call",
        Remarks: "",
        "Assigned Staff": "",
      },
    ]);
  };

  const onFile = async (file: File) => {
    setError(null);
    setImportedCount(null);
    setFileName(file.name);
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      setError("This file has no data rows.");
      setRows(null);
      return;
    }
    const headers = table[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase());
    const dataRows = table.slice(1);
    const seenPhones = new Set(existingLeads.map((l) => normalizePhone(l.parentPhone)));
    const fileSeenPhones = new Set<string>();

    const parsed: ParsedRow[] = dataRows.map((cells, i) => {
      const raw: Record<string, string> = {};
      headers.forEach((h, idx) => (raw[h] = (cells[idx] ?? "").trim()));

      const parentName = raw.parentName ?? "";
      const childName = raw.childName ?? "";
      const parentPhone = raw.parentPhone ?? "";
      const childAge = raw.childAge ?? "";
      const program = findByName(programs, raw.program);
      const source = raw.source?.trim();

      if (!parentName || !parentPhone || !childName || !childAge) {
        return { index: i, parentName, childName, status: "error", message: "Missing a required field (name/phone/child name/age)." };
      }
      if (!program) {
        return { index: i, parentName, childName, status: "error", message: `Course "${raw.program || "—"}" doesn't match any active program.` };
      }
      if (!source) {
        return { index: i, parentName, childName, status: "error", message: "Missing source." };
      }

      const phoneKey = normalizePhone(parentPhone);
      if (seenPhones.has(phoneKey) || fileSeenPhones.has(phoneKey)) {
        return { index: i, parentName, childName, status: "duplicate", message: "Phone number already exists — skipped." };
      }
      fileSeenPhones.add(phoneKey);

      const branch = findByName(branches, raw.branch);
      const campaign = findByName(campaigns, raw.campaign);
      const assignee = raw.assignedStaff ? users.find((u) => u.displayName.trim().toLowerCase() === raw.assignedStaff.trim().toLowerCase()) : undefined;
      const priority: Priority = (["High", "Medium", "Low"] as const).includes(raw.priority as Priority) ? (raw.priority as Priority) : "Medium";
      const followUpType: FollowUpType = (["Call", "WhatsApp", "Visit Reminder", "Email", "In-Person", "Other"] as const).includes(
        raw.nextFollowUpType as FollowUpType
      )
        ? (raw.nextFollowUpType as FollowUpType)
        : "Call";

      let followUpDate = raw.nextFollowUpAt ? new Date(raw.nextFollowUpAt) : null;
      let defaulted = false;
      if (!followUpDate || Number.isNaN(followUpDate.getTime())) {
        followUpDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        defaulted = true;
      }

      const fees = raw.fees && !Number.isNaN(Number(raw.fees)) ? Number(raw.fees) : null;

      const input: ImportRow = {
        parentName,
        parentPhone,
        parentEmail: raw.parentEmail || null,
        childName,
        childAge,
        interestedProgramId: program.id,
        branchId: branch?.id ?? null,
        location: raw.location || null,
        fees,
        sourceChannel: source,
        campaignId: campaign?.id ?? null,
        priority,
        notes: raw.notes || null,
        nextFollowUpAt: Timestamp.fromDate(followUpDate),
        nextFollowUpType: followUpType,
        assignedStaffId: assignee?.id ?? (defaultAssignee || null),
      };

      return {
        index: i,
        parentName,
        childName,
        status: "ready",
        message: defaulted ? "No valid follow-up date — defaulted to tomorrow." : "Ready.",
        input,
      };
    });

    setRows(parsed);
  };

  const readyRows = (rows ?? []).filter((r) => r.status === "ready" && r.input);

  const runImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const result = await createLeadsBatch(
        readyRows.map((r) => r.input!),
        currentUserId
      );
      setImportedCount(result.createdCount);
      setRows(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center"><Upload className="w-4 h-4" /></div>
            <h2 className="font-semibold text-ink">Upload enquiries (CSV)</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {importedCount != null ? (
            <div className="flex flex-col items-center text-center py-10">
              <FileCheck2 className="w-10 h-10 text-good mb-3" />
              <div className="font-semibold text-ink">Imported {importedCount} lead{importedCount === 1 ? "" : "s"}</div>
              <p className="text-sm text-ink-faint mt-1">They'll appear in the table immediately.</p>
              <Button className="mt-4" onClick={onClose}>Done</Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <label className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 cursor-pointer hover:border-accent/40 hover:bg-accent-soft/30 transition-colors">
                  <Upload className="w-4 h-4 text-ink-faint" />
                  <span className="text-sm font-semibold text-ink">{fileName || "Choose a CSV file…"}</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                  />
                </label>
                <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-strong">
                  <Download className="w-3.5 h-3.5" /> Download template
                </button>
              </div>

              {rows && (
                <div className="flex items-center gap-3 mb-3">
                  <Field label="Default assignee for unmatched rows">
                    <Select value={defaultAssignee} onChange={(e) => setDefaultAssignee(e.target.value)}>
                      <option value="">You (whoever imports)</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                    </Select>
                  </Field>
                </div>
              )}

              {error && <div className="rounded-lg border border-bad/20 bg-bad-soft px-3 py-2.5 text-sm text-bad mb-4">{error}</div>}

              {rows && (
                <div className="border border-border rounded-xl overflow-hidden mb-4">
                  <div className="px-4 py-2.5 bg-surface-2 text-xs font-semibold text-ink-soft flex items-center justify-between">
                    <span>{rows.length} rows parsed</span>
                    <span>
                      <span className="text-good font-bold">{readyRows.length} ready</span>
                      {" · "}
                      <span className="text-bad font-bold">{rows.filter((r) => r.status === "error").length} errors</span>
                      {" · "}
                      <span className="text-warn font-bold">{rows.filter((r) => r.status === "duplicate").length} duplicates</span>
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border-soft">
                    {rows.map((r) => (
                      <div key={r.index} className="flex items-center gap-3 px-4 py-2 text-sm">
                        {r.status === "ready" ? (
                          <FileCheck2 className="w-4 h-4 text-good shrink-0" />
                        ) : (
                          <FileWarning className={`w-4 h-4 shrink-0 ${r.status === "duplicate" ? "text-warn" : "text-bad"}`} />
                        )}
                        <span className="font-medium text-ink shrink-0">{r.parentName || "—"} · {r.childName || "—"}</span>
                        <span className="text-ink-faint truncate">{r.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {rows && importedCount == null && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-border-soft">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={runImport} disabled={importing || readyRows.length === 0}>
              {importing ? "Importing…" : `Import ${readyRows.length} lead${readyRows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
