import { useEffect, useMemo, useState } from "react";
import { X, MessageCircle, Send, CircleAlert, ShieldAlert, CheckCircle2, Paperclip, FileText, Pause, Play, Square } from "lucide-react";
import { Button, Select, Input, Textarea, SegmentedControl, Skeleton, ProgressBar } from "@/components/ui";
import { WhatsAppBatchItemsList } from "@/components/WhatsAppBatchItemsList";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useLookups } from "@/hooks/useLookups";
import { buildVariableContext, renderTemplate } from "@/lib/whatsapp/templates";
import { getWhatsAppSettings } from "@/lib/data/whatsapp";
import { createWhatsAppBatch, subscribeBatchItems, updateBatchStatus, cancelRemainingQueuedItems } from "@/lib/data/whatsappBatches";
import { useClickToChatQueue } from "@/lib/whatsapp/clickToChatQueue";
import { isValidLeadPhone } from "@/utils/phone";
import type { LeadDoc } from "@/types";
import type { WhatsAppBatchItemDoc, WhatsAppSettingsDoc } from "@/types/whatsapp";

type Mode = "custom" | "template";

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

  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<WhatsAppBatchItemDoc[]>([]);
  const [starting, setStarting] = useState(false);
  const queue = useClickToChatQueue(delaySeconds);

  useEffect(() => {
    getWhatsAppSettings().then(setSettings);
  }, []);
  useEffect(() => {
    if (!templateId && activeTemplates.length > 0) setTemplateId(activeTemplates[0].id);
  }, [activeTemplates, templateId]);
  useEffect(() => {
    if (!batchId) return;
    return subscribeBatchItems(batchId, setBatchItems);
  }, [batchId]);

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

  const canStart = !!content && sendableRows.length > 0 && urlValid && !queue.running && !starting && !batchId;

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

  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    try {
      const id = await createWhatsAppBatch({
        createdByStaffId: staffId,
        messageTemplate: content,
        linkLabel: urlProvided ? linkLabel.trim() || "Program / Admission Details" : null,
        linkUrl: urlProvided && urlValid ? linkUrl.trim() : null,
        attachmentName: attachment?.name ?? null,
        attachmentSize: attachment?.size ?? null,
        delaySeconds,
        items: rows.map((r) => ({
          leadId: r.lead.id,
          leadParentName: r.lead.parentName,
          leadChildName: r.lead.childName,
          mobile: r.lead.parentPhone,
          renderedMessage: r.render?.ok ? r.render.rendered! : "",
          valid: r.numberValid && !!r.render?.ok,
        })),
      });
      setBatchId(id);
      setStarting(false);

      const queueItems = sendableRows.map((r) => ({ itemId: r.lead.id, mobile: r.lead.parentPhone, renderedMessage: r.render!.rendered! }));
      const { stopped } = await queue.start(id, queueItems);
      if (stopped) {
        await cancelRemainingQueuedItems(id);
        await updateBatchStatus(id, "cancelled");
      } else {
        await updateBatchStatus(id, "completed", { completed: true });
      }
    } finally {
      setStarting(false);
    }
  };

  const progressDone = batchItems.filter((i) => i.status !== "QUEUED").length;
  const progressPct = batchItems.length > 0 ? (progressDone / batchItems.length) * 100 : 0;
  const currentItem = batchItems.find((i) => i.id === queue.currentItemId) ?? null;
  const isDone = !!batchId && !queue.running && !starting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={queue.running || starting ? undefined : onClose}>
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-good-soft text-good flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-ink">WhatsApp Batch Message — {leads.length} selected</h2>
          </div>
          {!queue.running && !starting && (
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

          {!batchId && (
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

          {batchId && queue.running && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-semibold text-ink mb-1">WhatsApp Batch Sending</div>
                <div className="text-xs text-ink-faint">
                  Progress: {progressDone} / {batchItems.length}
                </div>
              </div>
              <ProgressBar value={progressPct} tone="good" />
              {currentItem && (
                <div className="text-center">
                  <div className="text-xs uppercase tracking-wide text-ink-faint">Current Lead</div>
                  <div className="font-semibold text-ink">
                    {currentItem.leadParentName} · {currentItem.leadChildName}
                  </div>
                  <div className="text-xs text-ink-soft mt-1">
                    {queue.paused ? "Paused" : queue.countdown > 0 ? `Opening next chat in ${queue.countdown}s…` : "Opening WhatsApp…"}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                {!queue.paused ? (
                  <Button variant="secondary" onClick={queue.pause}>
                    <Pause className="w-4 h-4" /> Pause
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={queue.resume}>
                    <Play className="w-4 h-4" /> Resume
                  </Button>
                )}
                <Button variant="danger" onClick={queue.stop}>
                  <Square className="w-4 h-4" /> Stop Batch
                </Button>
              </div>
            </div>
          )}

          {batchId && (
            <div className="space-y-3">
              {isDone && (
                <div className="rounded-xl border border-border-soft bg-surface-2 p-4 text-sm space-y-1.5">
                  <div className="font-semibold text-ink mb-1">WhatsApp Batch Summary</div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Total selected</span>
                    <span className="font-semibold">{batchItems.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Opened (awaiting your confirmation below)</span>
                    <span className="font-semibold text-warn">{batchItems.filter((i) => i.status === "OPENED").length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Manually Sent</span>
                    <span className="font-semibold text-good">{batchItems.filter((i) => i.status === "MANUALLY_SENT").length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Failed</span>
                    <span className="font-semibold text-bad">{batchItems.filter((i) => i.status === "FAILED").length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Skipped</span>
                    <span className="font-semibold text-ink-faint">{batchItems.filter((i) => i.status === "SKIPPED").length}</span>
                  </div>
                  {batchItems.some((i) => i.status === "CANCELLED") && (
                    <div className="flex justify-between">
                      <span className="text-ink-soft">Cancelled (stopped)</span>
                      <span className="font-semibold text-ink-faint">{batchItems.filter((i) => i.status === "CANCELLED").length}</span>
                    </div>
                  )}
                  <div className="pt-1.5 mt-1.5 border-t border-border-soft text-xs text-ink-faint">
                    Confirm each "Opened" chat below once you've actually pressed Send in WhatsApp. This batch is also saved under
                    WhatsApp → Batches if you need to come back to it.
                  </div>
                </div>
              )}
              <WhatsAppBatchItemsList batchId={batchId} items={batchItems} currentItemId={queue.currentItemId} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border-soft">
          {!batchId && (
            <Button className="flex-1" disabled={!canStart} onClick={handleStart}>
              <Send className="w-4 h-4" /> {starting ? "Starting…" : `Start Batch — ${sendableRows.length} lead${sendableRows.length === 1 ? "" : "s"}`}
            </Button>
          )}
          {isDone && (
            <Button className="flex-1" variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
