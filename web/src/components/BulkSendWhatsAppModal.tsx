import { useEffect, useMemo, useRef, useState } from "react";
import { X, MessageCircle, Send, CircleAlert, ShieldAlert, CheckCircle2, Paperclip, FileText, Pause, Play, Square } from "lucide-react";
import { Button, Select, Input, Textarea, SegmentedControl, Skeleton, ProgressBar } from "@/components/ui";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useLookups } from "@/hooks/useLookups";
import { buildVariableContext, renderTemplate } from "@/lib/whatsapp/templates";
import { recordManualWhatsAppOpen } from "@/lib/whatsapp/engine";
import { getWhatsAppSettings } from "@/lib/data/whatsapp";
import { isValidLeadPhone } from "@/utils/phone";
import type { LeadDoc } from "@/types";
import type { WhatsAppSettingsDoc, WhatsAppTemplateDoc } from "@/types/whatsapp";

type Mode = "custom" | "template";
type RowOutcome = { kind: "opened" } | { kind: "cancelled" };
interface RowResult {
  leadId: string;
  outcome: RowOutcome | null; // null while still pending/not yet reached
}

// Default professional template (Section: DEFAULT MESSAGE TEMPLATE). WhatsApp renders
// *text* as bold and • as a bullet glyph natively — nothing in this CRM needs to convert
// them, it just has to preserve them exactly through encodeURIComponent.
const DEFAULT_TEMPLATE = `*Little Millennium Singanallur* 🌟

Dear *{{parent_name}}*,

Greetings from *Little Millennium Singanallur*! 👋

Thank you for showing interest in our preschool programs for *{{child_name}}*.

We are happy to share the details with you.

📚 *Programs Available*
• Toddler Program
• Pre-KG
• LKG
• UKG
• Day Care

📍 *Location*
Little Millennium Singanallur

📞 *For Admissions & Enquiries*
{{school_phone}}

🔗 *{{admission_link_label}}*
{{admission_link}}

We would be happy to assist you with the admission process and answer any questions you may have.

Please feel free to contact us.

*Regards,*
*Little Millennium Singanallur* 🌱`;

const MIN_DELAY_SECONDS = 5;
const MAX_ATTACHMENT_MB = 20;

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** WhatsApp's own *bold* markup, rendered for the live preview bubble only — the actual
 * text sent through the click-to-chat URL keeps the literal asterisks, exactly as WhatsApp expects. */
function whatsAppPreviewHtml(text: string): string {
  const escaped = escapeHtml(text);
  const bolded = escaped.replace(/\*([^\n*]+)\*/g, "<strong>$1</strong>");
  return bolded.replace(/\n/g, "<br/>");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function BulkSendWhatsAppModal({ leads, staffId, onClose }: { leads: LeadDoc[]; staffId: string; onClose: () => void }) {
  const { templates, loading } = useWhatsAppTemplates();
  const { programName, staffName } = useLookups();
  const activeTemplates = useMemo(() => templates.filter((t) => t.active), [templates]);

  const [mode, setMode] = useState<Mode>("custom");
  const [templateId, setTemplateId] = useState("");
  const [customText, setCustomText] = useState(DEFAULT_TEMPLATE);
  const [linkLabel, setLinkLabel] = useState("Program / Admission Details");
  const [linkUrl, setLinkUrl] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(15);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [settings, setSettings] = useState<WhatsAppSettingsDoc | null>(null);

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const pausedRef = useRef(false);
  const stopRef = useRef(false);

  useEffect(() => {
    getWhatsAppSettings().then(setSettings);
  }, []);
  useEffect(() => {
    if (!templateId && activeTemplates.length > 0) setTemplateId(activeTemplates[0].id);
  }, [activeTemplates, templateId]);

  const template = activeTemplates.find((t) => t.id === templateId) ?? null;
  const content = mode === "template" ? template?.content ?? "" : customText;

  const urlProvided = linkUrl.trim().length > 0;
  const urlValid = !urlProvided || isValidHttpUrl(linkUrl.trim());

  const rows = leads.map((lead) => {
    const base = settings
      ? buildVariableContext({
          parentName: lead.parentName,
          childName: lead.childName,
          mobile: lead.parentPhone,
          programName: programName(lead.interestedProgramId),
          stage: lead.status,
          sourceChannel: lead.sourceChannel,
          visitDate: lead.visitDate,
          staffName: lead.assignedStaffId ? staffName(lead.assignedStaffId) : null,
          nextFollowUpAt: lead.nextFollowUpAt,
          schoolName: settings.schoolName,
          schoolPhone: settings.schoolPhone,
          schoolAddress: settings.schoolAddress,
        })
      : {};
    const context = {
      ...base,
      ...(urlProvided && urlValid ? { admission_link: linkUrl.trim(), admission_link_label: linkLabel.trim() || "Program / Admission Details" } : {}),
    };
    const numberValid = isValidLeadPhone(lead.parentPhone);
    const render = content ? renderTemplate(content, context) : null;
    return { lead, context, numberValid, render };
  });

  const sendableRows = rows.filter((r) => r.numberValid && r.render?.ok);
  const invalidCount = rows.filter((r) => !r.numberValid).length;
  const missingDataCount = rows.filter((r) => r.numberValid && r.render && !r.render.ok).length;
  const optedOutCount = rows.filter((r) => r.numberValid && r.lead.whatsappOptStatus === "Opted Out").length;

  const previewRow = rows[0] ?? null;
  const previewHtml = previewRow?.render?.ok ? whatsAppPreviewHtml(previewRow.render.rendered!) : null;

  const canStart = !!content && sendableRows.length > 0 && urlValid && !running;

  const handleAttachmentChange = (file: File | null) => {
    setAttachmentError(null);
    if (!file) {
      setAttachment(null);
      return;
    }
    if (file.type !== "application/pdf") {
      setAttachmentError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setAttachmentError(`File is too large — please keep it under ${MAX_ATTACHMENT_MB} MB.`);
      return;
    }
    setAttachment(file);
  };

  const waitWhilePaused = async () => {
    while (pausedRef.current && !stopRef.current) await sleep(200);
  };

  // Ticks in small steps (rather than one long setTimeout) so Pause/Stop take effect
  // within a fraction of a second instead of waiting out the whole delay.
  const delayWithControl = async (totalMs: number) => {
    const step = 500;
    let elapsed = 0;
    while (elapsed < totalMs) {
      if (stopRef.current) return;
      await waitWhilePaused();
      if (stopRef.current) return;
      await sleep(step);
      elapsed += step;
      setCountdown(Math.max(0, Math.ceil((totalMs - elapsed) / 1000)));
    }
  };

  const handleStart = async () => {
    if (!canStart) return;
    setRunning(true);
    setPaused(false);
    pausedRef.current = false;
    stopRef.current = false;
    setCurrentIndex(0);
    const initial: RowResult[] = sendableRows.map((r) => ({ leadId: r.lead.id, outcome: null }));
    setResults(initial);

    const templateForLog: WhatsAppTemplateDoc =
      mode === "template" && template
        ? template
        : {
            id: "custom",
            name: "Custom Message",
            category: "General",
            language: "English",
            content: customText,
            active: true,
            createdByStaffId: staffId,
            createdAt: null,
            updatedAt: null,
          };

    for (let i = 0; i < sendableRows.length; i++) {
      setCurrentIndex(i);
      await waitWhilePaused();
      if (stopRef.current) break;

      const { lead, context, render } = sendableRows[i];
      // Click-to-Chat (Section 5/26) — this only opens/prepares a chat with the text
      // pre-filled; it has no way to confirm the message was actually sent, delivered,
      // or read, and cannot attach a file. Never report anything stronger than "opened"
      // from this path. When a real provider (Meta Cloud API) is connected later, this
      // branch is the only thing that needs to change — everything upstream (lead
      // selection, personalization, the queue/delay loop) stays the same.
      const digits = lead.parentPhone.replace(/[^0-9]/g, "");
      const url = `https://api.whatsapp.com/send/?phone=${digits}&text=${encodeURIComponent(render!.rendered!)}`;
      window.open(url, "_blank", "noreferrer");

      const leadContext = {
        id: lead.id,
        parentName: lead.parentName,
        childName: lead.childName,
        parentPhone: lead.parentPhone,
        interestedProgramId: lead.interestedProgramId,
        status: lead.status,
        sourceChannel: lead.sourceChannel,
        visitDate: lead.visitDate,
        assignedStaffId: lead.assignedStaffId,
        nextFollowUpAt: lead.nextFollowUpAt,
        whatsappOptStatus: lead.whatsappOptStatus,
      };
      await recordManualWhatsAppOpen({ lead: leadContext, template: templateForLog, variableContext: context, staffId }).catch(() => null);

      setResults((prev) => prev!.map((r, idx) => (idx === i ? { leadId: lead.id, outcome: { kind: "opened" } } : r)));

      if (i < sendableRows.length - 1) {
        await delayWithControl(delaySeconds * 1000);
        if (stopRef.current) break;
      }
    }

    if (stopRef.current) {
      setResults((prev) => prev!.map((r) => (r.outcome == null ? { ...r, outcome: { kind: "cancelled" } } : r)));
    }
    setRunning(false);
    setCountdown(0);
  };

  const handlePause = () => {
    pausedRef.current = true;
    setPaused(true);
  };
  const handleResume = () => {
    pausedRef.current = false;
    setPaused(false);
  };
  const handleStop = () => {
    stopRef.current = true;
    pausedRef.current = false;
    setPaused(false);
  };

  const openedCount = results?.filter((r) => r.outcome?.kind === "opened").length ?? 0;
  const cancelledCount = results?.filter((r) => r.outcome?.kind === "cancelled").length ?? 0;
  const progressDone = results?.filter((r) => r.outcome != null).length ?? 0;
  const progressPct = results && results.length > 0 ? (progressDone / results.length) * 100 : 0;
  const currentLeadName =
    running && sendableRows[currentIndex] ? `${sendableRows[currentIndex].lead.parentName} · ${sendableRows[currentIndex].lead.childName}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={running ? undefined : onClose}>
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-good-soft text-good flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-ink">WhatsApp Batch Message — {leads.length} selected</h2>
          </div>
          {!running && (
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
            <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong className="font-semibold">WhatsApp API is not connected.</strong> The CRM will open each WhatsApp chat with the
              customized message. Actual sending and attachment must be completed in WhatsApp. Mode:{" "}
              <strong className="font-semibold">Click-to-Chat</strong>.
            </span>
          </div>

          {!running && results === null && (
            <>
              <SegmentedControl
                options={[
                  { value: "custom" as Mode, label: "Write / edit message" },
                  { value: "template" as Mode, label: "Use a saved template" },
                ]}
                value={mode}
                onChange={setMode}
              />

              {mode === "custom" ? (
                <Textarea
                  rows={12}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  className="font-mono text-[13px] leading-relaxed"
                />
              ) : loading ? (
                <Skeleton className="h-9 w-full" />
              ) : activeTemplates.length === 0 ? (
                <p className="text-sm text-ink-faint">No active templates yet. Create one in WhatsApp Automation → Templates.</p>
              ) : (
                <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {activeTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">Link Label</label>
                  <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Program / Admission Details" />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">Link URL</label>
                  <Input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://littlemillennium.com/admissions"
                    className={!urlValid ? "!border-bad focus:!ring-bad/15" : ""}
                  />
                  {!urlValid && <p className="text-xs text-bad mt-1">Please enter a valid URL.</p>}
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Attachment</label>
                {attachment ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-border-soft bg-surface-2 px-3.5 py-2.5">
                    <FileText className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-sm text-ink truncate flex-1">{attachment.name}</span>
                    <span className="text-xs text-ink-faint shrink-0">{(attachment.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button type="button" onClick={() => handleAttachmentChange(null)} className="text-ink-faint hover:text-bad shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3.5 py-2.5 text-sm text-ink-soft cursor-pointer hover:bg-surface-2">
                    <Paperclip className="w-4 h-4 shrink-0" />
                    Upload PDF…
                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleAttachmentChange(e.target.files?.[0] ?? null)} />
                  </label>
                )}
                {attachmentError && <p className="text-xs text-bad mt-1">{attachmentError}</p>}
                <p className="text-xs text-ink-faint mt-1.5">
                  The CRM can't attach this automatically yet — you'll attach it in WhatsApp yourself for each chat that opens.
                </p>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-ink mb-1.5">Delay between chats</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={MIN_DELAY_SECONDS}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Math.max(MIN_DELAY_SECONDS, Number(e.target.value) || MIN_DELAY_SECONDS))}
                    className="w-24"
                  />
                  <span className="text-sm text-ink-soft">seconds (minimum {MIN_DELAY_SECONDS}s, to avoid opening every chat at once)</span>
                </div>
              </div>

              {previewHtml && (
                <div>
                  <label className="block text-[13px] font-semibold text-ink mb-1.5">
                    Live Preview {previewRow && <span className="font-normal text-ink-faint">— {previewRow.lead.parentName}</span>}
                  </label>
                  <div
                    className="rounded-2xl bg-[#DCF8C6] p-4 text-[13.5px] text-[#111b21] leading-relaxed shadow-inner"
                    style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
                  >
                    <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                  {attachment && (
                    <div className="flex items-center gap-2 mt-2 rounded-xl border border-border-soft bg-surface-2 px-3 py-2 text-xs text-ink-soft">
                      <FileText className="w-3.5 h-3.5 text-accent shrink-0" /> {attachment.name} will be attached manually
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-border-soft bg-surface-2 p-3.5 text-sm space-y-2">
                <div className="flex items-center gap-1.5 text-ink-soft">
                  <CheckCircle2 className="w-3.5 h-3.5 text-good shrink-0" />
                  <span>{sendableRows.length} of {leads.length} valid WhatsApp numbers will be processed.</span>
                </div>
                {invalidCount > 0 && (
                  <div className="flex items-center gap-1.5 text-ink-faint">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{invalidCount} skipped — invalid/missing mobile number.</span>
                  </div>
                )}
                {missingDataCount > 0 && (
                  <div className="flex items-center gap-1.5 text-ink-faint">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{missingDataCount} skipped — message needs data this lead doesn't have.</span>
                  </div>
                )}
                {optedOutCount > 0 && (
                  <div className="flex items-center gap-1.5 text-bad">
                    <CircleAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{optedOutCount} of those have opted out of WhatsApp — included since this is a manual send; please use discretion.</span>
                  </div>
                )}
                {sendableRows.length > 0 && (
                  <div className="text-xs text-ink-faint pt-1 border-t border-border-soft/70">
                    Estimated minimum time: {formatDuration(Math.max(0, sendableRows.length - 1) * delaySeconds)}
                  </div>
                )}
              </div>
            </>
          )}

          {running && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-semibold text-ink mb-1">WhatsApp Batch Sending</div>
                <div className="text-xs text-ink-faint">
                  Progress: {progressDone} / {results!.length}
                </div>
              </div>
              <ProgressBar value={progressPct} tone="good" />
              {currentLeadName && (
                <div className="text-center">
                  <div className="text-xs uppercase tracking-wide text-ink-faint">Current Lead</div>
                  <div className="font-semibold text-ink">{currentLeadName}</div>
                  <div className="text-xs text-ink-soft mt-1">
                    {paused ? "Paused" : countdown > 0 ? `Opening next chat in ${countdown}s…` : "Opening WhatsApp…"}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                {!paused ? (
                  <Button variant="secondary" onClick={handlePause}>
                    <Pause className="w-4 h-4" /> Pause
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={handleResume}>
                    <Play className="w-4 h-4" /> Resume
                  </Button>
                )}
                <Button variant="danger" onClick={handleStop}>
                  <Square className="w-4 h-4" /> Stop Batch
                </Button>
              </div>
            </div>
          )}

          {!running && results !== null && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border-soft bg-surface-2 p-4 text-sm space-y-1.5">
                <div className="font-semibold text-ink mb-1">WhatsApp Batch Summary</div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">Total selected</span>
                  <span className="font-semibold">{leads.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-soft">Opened</span>
                  <span className="font-semibold text-good">{openedCount}</span>
                </div>
                {cancelledCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Cancelled (stopped)</span>
                    <span className="font-semibold text-ink-faint">{cancelledCount}</span>
                  </div>
                )}
                {invalidCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Skipped — invalid number</span>
                    <span className="font-semibold text-bad">{invalidCount}</span>
                  </div>
                )}
                {missingDataCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Skipped — missing data</span>
                    <span className="font-semibold text-bad">{missingDataCount}</span>
                  </div>
                )}
                <div className="pt-1.5 mt-1.5 border-t border-border-soft text-xs text-ink-faint">
                  "Opened" means the WhatsApp chat was prepared and opened — not that the message was actually sent or delivered.
                  Confirm each send in WhatsApp itself.
                </div>
              </div>
              <div className="rounded-xl border border-border-soft divide-y divide-border-soft max-h-56 overflow-y-auto">
                {results.map((r) => {
                  const lead = leads.find((l) => l.id === r.leadId)!;
                  return (
                    <div key={r.leadId} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                      <span className="truncate">
                        {lead.parentName} · {lead.childName}
                      </span>
                      <span className={`text-xs font-semibold shrink-0 ${r.outcome?.kind === "opened" ? "text-good" : "text-ink-faint"}`}>
                        {r.outcome?.kind === "opened" ? "Opened" : "Cancelled"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border-soft">
          {!running && results === null && (
            <Button className="flex-1" disabled={!canStart} onClick={handleStart}>
              <Send className="w-4 h-4" /> Start Batch — {sendableRows.length} lead{sendableRows.length === 1 ? "" : "s"}
            </Button>
          )}
          {!running && results !== null && (
            <Button className="flex-1" variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
