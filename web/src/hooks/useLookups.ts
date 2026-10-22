import { useEffect, useState } from "react";
import { subscribeLeadSources, subscribePrograms, subscribeBranches, subscribeCampaigns, subscribeAdmissionTypes, subscribeAcademicYears } from "@/lib/data/lookups";
import { subscribeUsers } from "@/lib/data/users";
import type { LeadSourceDoc, ProgramDoc, BranchDoc, CampaignDoc, UserDoc, AdmissionTypeDoc, AcademicYearDoc } from "@/types";

export function useLookups() {
  const [leadSources, setLeadSources] = useState<LeadSourceDoc[]>([]);
  const [programs, setPrograms] = useState<ProgramDoc[]>([]);
  const [branches, setBranches] = useState<BranchDoc[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  const [admissionTypes, setAdmissionTypes] = useState<AdmissionTypeDoc[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearDoc[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);

  useEffect(() => {
    const unsubs = [
      subscribeLeadSources(setLeadSources),
      subscribePrograms(setPrograms),
      subscribeBranches(setBranches),
      subscribeCampaigns(setCampaigns),
      subscribeAdmissionTypes(setAdmissionTypes),
      subscribeAcademicYears(setAcademicYears),
      subscribeUsers(setUsers),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const programName = (id: string | null) => programs.find((p) => p.id === id)?.name ?? "—";
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name ?? "—";
  const admissionTypeName = (id: string | null) => admissionTypes.find((a) => a.id === id)?.name ?? "—";
  const academicYearName = (id: string | null) => academicYears.find((a) => a.id === id)?.name ?? "—";
  const staffName = (id: string | null) => users.find((u) => u.id === id)?.displayName ?? "Unassigned";

  return {
    leadSources, programs, branches, campaigns, admissionTypes, academicYears, users,
    programName, branchName, campaignName, admissionTypeName, academicYearName, staffName,
  };
}
