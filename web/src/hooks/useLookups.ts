import { useEffect, useState } from "react";
import { subscribeLeadSources, subscribePrograms, subscribeBranches, subscribeCampaigns } from "@/lib/data/lookups";
import { subscribeUsers } from "@/lib/data/users";
import type { LeadSourceDoc, ProgramDoc, BranchDoc, CampaignDoc, UserDoc } from "@/types";

export function useLookups() {
  const [leadSources, setLeadSources] = useState<LeadSourceDoc[]>([]);
  const [programs, setPrograms] = useState<ProgramDoc[]>([]);
  const [branches, setBranches] = useState<BranchDoc[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);

  useEffect(() => {
    const unsubs = [
      subscribeLeadSources(setLeadSources),
      subscribePrograms(setPrograms),
      subscribeBranches(setBranches),
      subscribeCampaigns(setCampaigns),
      subscribeUsers(setUsers),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const programName = (id: string | null) => programs.find((p) => p.id === id)?.name ?? "—";
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name ?? "—";
  const staffName = (id: string | null) => users.find((u) => u.id === id)?.displayName ?? "Unassigned";

  return { leadSources, programs, branches, campaigns, users, programName, branchName, campaignName, staffName };
}
