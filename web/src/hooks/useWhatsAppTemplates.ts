import { useEffect, useState } from "react";
import { subscribeWhatsAppTemplates } from "@/lib/data/whatsapp";
import type { WhatsAppTemplateDoc } from "@/types/whatsapp";

// Deliberately separate from useLookups() — most pages don't need the template list,
// so there's no reason to force that subscription onto every page that calls useLookups.
export function useWhatsAppTemplates() {
  const [templates, setTemplates] = useState<WhatsAppTemplateDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeWhatsAppTemplates((items) => {
      setTemplates(items);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { templates, loading };
}
