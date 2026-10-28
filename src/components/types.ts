export type Resume = {
  id: string;
  title: string;
  content: string;
  skills: string[];
  geography: string;
  updatedAt: string;
  salary: number | null;
  currency: string;
  externalId: string | null;
  employment: string;
  workFormat: string;
};
export type Search = {
  id: string;
  name: string;
  query: string;
  active: boolean;
  minScore: number;
  dailyLimit: number;
  mode: string;
  intervalMinutes: number;
  resumes: { resumeId: string }[];
  [key: string]: unknown;
};
export type Application = {
  id: string;
  status: string;
  pipeline: string;
  resultSource: string | null;
  createdAt: string;
  appliedAt: string | null;
  respondedAt: string | null;
  feedback: string | null;
  error: string | null;
  searchId: string;
  vacancy: {
    id: string;
    title: string;
    employer: string;
    salaryFrom: number | null;
    salaryTo: number | null;
    currency: string | null;
    workFormats: string[];
    url: string;
    description: string;
    publishedAt: string;
  };
  analysis: {
    score: number;
    confidence: number;
    reason: string;
    decision: string;
    data: {
      matchingSkills: string[];
      missingSkills: string[];
      advantages: string[];
      risks: string[];
    };
  } | null;
  letter: { text: string } | null;
  resume: Resume | null;
  search: { name: string; minScore: number };
  questions?: {
    id: string;
    text: string;
    category: string;
    materials: string[];
    deadline: string | null;
    answer: { text: string } | null;
  }[];
  events?: { id: string; message: string; createdAt: string }[];
};
export type Settings = {
  agentState: string;
  dryRun: boolean;
  dailyLimit: number;
  employerLimit: number;
  activeStart: number;
  activeEnd: number;
  timezone: string;
  letterInstructions: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpTls: boolean;
  smtpFrom: string;
  hasSmtpSecret: boolean;
  notificationTypes: string[];
  blacklist: string[];
  blockedVacancies: string[];
};
export type Dashboard = {
  kpi: Record<string, number>;
  profiles: number;
  resumeCount: number;
  agentState: string;
  dryRun: boolean;
  account: { connected: boolean; expiresAt: string } | null;
  lastScanAt: string | null;
  applications: Application[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reservedCost: number | null;
    estimatedCost: number | null;
  };
  truncated: boolean;
};
export type Task = {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  deadline: string | null;
  completedAt: string | null;
  application: { vacancy: Application['vacancy'] } | null;
};
