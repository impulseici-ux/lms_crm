import { useEffect, useMemo, useState } from "react";
import { X, MessageCircle, ExternalLink, Send, CircleAlert } from "lucide-react";
import { Button, Select, Skeleton } from "@/components/ui";
import { WhatsAppDevBanner } from "@/components/WhatsAppDevBanner";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useLookups } from "@/hooks/useLookups";
import { buildVariableContext, renderTemplate } from "@/lib/whatsapp/templates";
import { sendManualWhatsAppMessage, recordManualWhatsAppOpen } from "@/lib/whatsapp/engine";
import { getWhatsAppSettings } from "@/lib/data/whatsapp";
import { isValidLeadPhone } from "@/utils/phone";
import type { LeadDoc } from "@/types";
import type { WhatsAppSettingsDoc } from "@/types/whatsapp";

export function SendWhatsAppModal({ lead, staffId, onClose }: { lead: LeadDoc; staffId: string; onClose: () => void }) {
  const { templates, loading } = useWhatsAppTemplates();
  const { programName, staffName } = useLookups();
  const activeTemplates = useMemo(() => templates.filter((t) => t.active), [templates]);
  const [templateId, setTemplateId] = useState("");
  const [settings, setSettings] = useState<WhatsAppSettingsDoc | null>(null);
  const [result, setResult] = useState<{ kind: "simulated" | "opened" | "failed"; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getWhatsAppSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!templateId && activeTemplates.length > 0) setTemplateId(activeTemplates[0].id);
  }, [activeTemplates, templateId]);

  const template = activeTemplates.find((t) => t.id === templateId) ?? null;
  const numberValid = isValidLeadPhone(lead.parentPhone);

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

  const render = template ? renderTemplate(template.content, context) : null;

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

  const handleSimulateSend = async () => {
    if (!template || !render?.ok) return;
    setBusy(true);
    try {
      const outcome = await sendManualWhatsAppMessage({ lead: leadContext, template, variableContext: context, staffId });
      if (outcome.status === "simulated") setResult({ kind: "simulated", detail: "This is a simulated message. No WhatsApp message was actually sent." });
      else if (outcome.status === "blocked") setResult({ kind: "failed", detail: outcome.reason });
      else setResult({ kind: "failed", detail: "reason" in outcome ? outcome.reason : "Could not send." });
    } finally {
      setBusy(false);
    }
  };

  const handleOpenWhatsApp = async () => {
    if (!template || !render?.ok) return;
    setBusy(true);
    try {
      await recordManualWhatsAppOpen({ lead: leadContext, template, variableContext: context, staffId });
      const digits = lead.parentPhone.replace(/[^0-9]/g, "");
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(render.rendered!)}`, "_blank", "noreferrer");
      setResult({ kind: "opened", detail: "WhatsApp opened with the message pre-filled. You still need to press Send yourself." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-good-soft text-good flex items-center justify-center"><MessageCircle className="w-4 h-4" /></div>
            <h2 className="font-semibold text-ink">WhatsApp Message Preview</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:bg-surface-2 hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <WhatsAppDevBanner />

          {lead.whatsappOptStatus === "Opted Out" && (
            <div className="flex items-start gap-2.5 rounded-xl border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">
              <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>This lead has opted out of WhatsApp messaging. Automated messages are blocked — sending manually is still possible but please use discretion.</span>
            </div>
          )}

          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1">To</div>
            <div className="font-medium text-ink">
              {numberValid ? lead.parentPhone : <span className="text-bad">Invalid Number</span>}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1">Template</div>
            {loading ? (
              <Skeleton className="h-9 w-full" />
            ) : activeTemplates.length === 0 ? (
              <p className="text-sm text-ink-faint">No active templates yet. Create one in WhatsApp Automation → Templates.</p>
            ) : (
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </div>

          {template && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-1">Message</div>
              <div className="rounded-xl border border-border-soft bg-surface-2 p-3.5 text-sm whitespace-pre-wrap text-ink">
                {render?.ok ? render.rendered : template.content}
              </div>
              {render && !render.ok && (
                <p className="text-xs text-bad mt-1.5">
                  Missing data for: {render.missing.join(", ")} — this lead doesn't have that information yet, so sending is blocked.
                </p>
              )}
            </div>
          )}

          {result && (
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-[13px] ${
                result.kind === "failed" ? "border-bad/25 bg-bad-soft text-bad" : "border-accent/25 bg-accent-soft text-accent-strong"
              }`}
            >
              {result.detail}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border-soft">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!template || !render?.ok || !numberValid || busy}
            onClick={handleOpenWhatsApp}
          >
            <ExternalLink className="w-4 h-4" /> Open WhatsApp
          </Button>
          <Button className="flex-1" disabled={!template || !render?.ok || !numberValid || busy} onClick={handleSimulateSend}>
            <Send className="w-4 h-4" /> Simulate Send
          </Button>
        </div>
      </div>
    </div>
  );
}
