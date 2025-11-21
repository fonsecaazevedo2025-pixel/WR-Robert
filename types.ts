
export interface DailyEntry {
  date: string; // YYYY-MM-DD
  newLeads: number;
  discardedLeads: number;
  repiqueLeads: number;
  localVisits: number;
  contactingLeads: number;
  inProgressLeads: number;
  scheduledLeads: number;
  negotiationLeads: number;
  creditAnalysisLeads: number;
  approvedLeads: number;
  signedLeads: number;
  discardReason?: string; // Added for tracking reasons when discardedLeads > 0
  startOfDayBalance?: number; // Added for calculated balance in dashboard/reports
}

export interface BrokerProfile {
  brokerName: string;
  initialLeads: number;
  monthlySalesGoal?: number;
  dailyEntries: DailyEntry[];
}

// FIX: Add LeadPerformanceData interface to resolve missing export errors.
export interface LeadPerformanceData {
  brokerName: string;
  initialLeads: number;
  newLeads: number;
  discardedLeads: number;
  contactingLeads: number;
  inProgressLeads: number;
  scheduledLeads: number;
  scheduledDateTime: string;
  negotiationLeads: number;
  creditAnalysisLeads: number;
  approvedLeads: number;
  signedLeads: number;
}
