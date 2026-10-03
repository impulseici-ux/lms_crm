import { useEffect, useMemo, useState } from "react";
import { X, MessageCircle, Send, CircleAlert, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button, Select, Textarea, SegmentedControl, Skeleton } from "@/components/ui";
import { WhatsAppDevBanner } from "@/components/WhatsAppDevBanner";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useLookups } from "@/hooks/useLookups";
import { buildVariableContext, renderTemplate } from "@/lib/whatsapp/templates";
import { sendManualWhatsAppMessage, type QueueOutcome } from "@/lib/whatsapp/engine";
import { getWhatsAppSettings } from "@/lib/data/whatsapp";
import { getWhatsAppProviderName } from "@/lib/whatsapp/provider";
import { isValidLeadPhone } from "@/utils/phone";
import type { LeadDoc } from "@/types";
import type { WhatsAppSettingsDoc, WhatsAppTemplateDoc } from "@/types/whatsapp";

type Mode = "template" | "custom";

interface RowResult {
  leadId: string;
  outcome: QueueOutcome | null; // null while still pending
}

export function BulkSendWhatsAppModal({ leads, staffId, onClose }: { leads: LeadDoc[]; staffId: string; onClose: () => void }) {
  const { templates, loading } = useWhatsAppTemplates();
  const { programName, staffName } = useLookups();
  const activeTemplates = useMemo(() => templates.filter((t) => t.active), [templates]);

  const [mode, setMode] = useState<Mode>("template");
  const [templateId, setTemplateId] = useState("");
  const [customText, setCustomText] = useState("");
  const [settings, setSettings] = useState<WhatsAppSettingsDoc | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);

  useEffect(() => {
    getWhatsAppSettings().then(setSettings);
  }, []);
  useEffect(() => {
    if (!templateId && activeTemplates.length > 0) setTemplateId(activeTemplates[0].id);
  }, [activeTemplates, templateId]);

  const template = activeTemplates.find((t) => t.id === templateId) ?? null;
  const content = mode === "template" ? template?.content ?? "" : customText;

  const rows = leads.map((lead) => {
    const context = settings
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
    const numberValid = isValidLeadPhone(lead.parentPhone);
    const render = content ? renderTemplate(content, context) : null;
    return { lead, context, numberValid, render };
  });

  const sendableRows = rows.filter((r) => r.numberValid && r.render?.ok);
  const invalidCount = rows.filter((r) => !r.numberValid).length;
  const missingDataCount = rows.filter((r) => r.numberValid && r.render && !r.render.ok).length;
  const optedOutCount = rows.filter((r) => r.numberValid && r.lead.whatsappOptStatus === "Opted Out").length;

  const isDevMode = getWhatsAppProviderName() === "development";
  const sentCount = results?.filter((r) => r.outcome && (r.outcome.status === "simulated" || r.outcome.status === "sent")).length ?? 0;
  const blockedCount = results?.filter((r) => r.outcome && (r.outcome.status === "blocked" || r.outcome.status === "failed")).length ?? 0;
  const donePending = results?.filter((r) => r.outcome == null).length ?? 0;

  const handleSend = async () => {
    if (!content || sendableRows.length === 0) return;
    setSending(true);
    const initial: RowResult[] = sendableRows.map((r) => ({ leadId: r.lead.id, outcome: null }));
    setResults(initial);

    const templateForSend: WhatsAppTemplateDoc =
      mode === "template" && template
        ? template
        : { id: "custom", name: "Custom Message", category: "General", language: "English", content: customText, active: true, createdByStaffId: staffId, createdAt: null, updatedAt: null };

    for (let i = 0; i < sendableRows.length; i++) {
      const { lead, context } = sendableRows[i];
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
      const outcome = await sendManualWhatsAppMessage({ lead: leadContext, template: templateForSend, variableContext: context, staffId });
      setResults((prev) => prev!.map((r, idx) => (idx === i ? { leadId: lead.id, outcome } : r)));
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={sending ? undefined : onClose}>
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-good-soft text-good flex items-center justify-center"><MessageCircle className="w-4 h-4" /></div>
            <h2 className="font-semibold text-ink">Bulk WhatsApp Message — {leads.length} selected</h2>
          </div>
          {!sending && (
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <WhatsAppDevBanner />

          {results === null && (
            <>
              <SegmentedControl
                options={[
                  { value: "template" as Mode, label: "Use a template" },
                  { value: "custom" as Mode, label: "Write custom message" },
                ]}
                value={mode}
                onChange={setMode}
              />

              {mode === "template" ? (
                loading ? (
                  <Skeleton className="h-9 w-full" />
                ) : activeTemplates.length === 0 ? (
                  <p className="text-sm text-ink-faint">No active templates yet. Create one in WhatsApp Automation → Templates.</p>
                ) : (
                  <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                )
              ) : (
                <div>
                  <Textarea
                    rows={5}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Type your message… you can use {{parent_name}}, {{child_name}}, {{course}}, {{staff_name}}, {{school_name}}, {{school_phone}}, {{school_address}}, {{visit_date}}, {{visit_time}}, {{followup_date}}, {{followup_time}}."
                  />
                  <p className="text-xs text-ink-faint mt-1.5">
                    Note: free-text sends like this are fine for replying to a parent within WhatsApp's 24-hour window. Once a real
                    WhatsApp provider is connected, proactively messaging leads you haven't heard from recently requires a
                    Meta-approved template instead.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-border-soft bg-surface-2 p-3.5 text-sm space-y-2">
                <div className="flex items-center gap-1.5 text-ink-soft">
                  <CheckCircle2 className="w-3.5 h-3.5 text-good shrink-0" />
                  <span>{sendableRows.length} of {leads.length} will be sent to.</span>
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
                    <span>{missingDataCount} skipped — message needs data this lead doesn't have (e.g. a visit date).</span>
                  </div>
                )}
                {optedOutCount > 0 && (
                  <div className="flex items-center gap-1.5 text-bad">
                    <CircleAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{optedOutCount} of those have opted out of WhatsApp — they're included since this is a manual send, but please use discretion.</span>
                  </div>
                )}
              </div>
            </>
          )}

          {results !== null && (
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm font-semibold">
                <span className="text-good">{sentCount} {isDevMode ? "simulated" : "sent"}</span>
                {blockedCount > 0 && <span className="text-bad">{blockedCount} blocked</span>}
                {donePending > 0 && <span className="text-ink-faint">{donePending} remaining…</span>}
              </div>
              <div className="rounded-xl border border-border-soft divide-y divide-border-soft max-h-72 overflow-y-auto">
                {results.map((r) => {
                  const lead = leads.find((l) => l.id === r.leadId)!;
                  return (
                    <div key={r.leadId} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                      <span className="truncate">{lead.parentName} · {lead.childName}</span>
                      {r.outcome == null ? (
                        <span className="text-ink-faint text-xs shrink-0">Sending…</span>
                      ) : r.outcome.status === "simulated" || r.outcome.status === "sent" ? (
                        <span className="text-good text-xs font-semibold shrink-0">{r.outcome.status === "simulated" ? "Simulated" : "Sent"}</span>
                      ) : (
                        <span className="text-bad text-xs font-semibold shrink-0" title={"reason" in r.outcome ? r.outcome.reason : undefined}>
                          Blocked
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border-soft">
          {results === null ? (
            <Button className="flex-1" disabled={!content || sendableRows.length === 0 || sending} onClick={handleSend}>
              <Send className="w-4 h-4" /> {isDevMode ? "Simulate Send" : "Send"} to {sendableRows.length} lead{sendableRows.length === 1 ? "" : "s"}
            </Button>
          ) : (
            <Button className="flex-1" variant="secondary" disabled={sending} onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
