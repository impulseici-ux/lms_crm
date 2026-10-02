import { useEffect, useState } from "react";
import { subscribeWhatsAppAutomations } from "@/lib/data/whatsapp";
import type { WhatsAppAutomationDoc } from "@/types/whatsapp";

export function useWhatsAppAutomations() {
  const [automations, setAutomations] = useState<WhatsAppAutomationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeWhatsAppAutomations((items) => {
      setAutomations(items);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { automations, loading };
}
