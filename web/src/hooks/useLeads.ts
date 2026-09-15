import { useEffect, useState } from "react";
import { subscribeLeads } from "@/lib/data/leads";
import type { LeadDoc } from "@/types";

export function useLeads() {
  const [leads, setLeads] = useState<LeadDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return subscribeLeads((l) => {
      setLeads(l);
      setLoading(false);
    });
  }, []);

  return { leads, loading };
}
