import { z } from 'zod';
export const weightsSchema = z
  .object({
    stack: z.number().min(0).max(100),
    experience: z.number().min(0).max(100),
    salary: z.number().min(0).max(100),
    format: z.number().min(0).max(100),
    duties: z.number().min(0).max(100),
    preferences: z.number().min(0).max(100),
  })
  .refine(
    (v) => Object.values(v).reduce((a, b) => a + b, 0) === 100,
    'Сумма весов должна равняться 100',
  );
export const defaultWeights = {
  stack: 30,
  experience: 20,
  salary: 20,
  format: 15,
  duties: 10,
  preferences: 5,
};
const list = z.array(z.string().trim().min(1).max(200)).max(200).default([]);
export const searchSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    active: z.boolean().default(true),
    query: z.string().trim().min(1).max(500),
    exclude: list,
    area: z.string().regex(/^\d+$/).default('113'),
    salaryMin: z.number().int().nonnegative().nullable().default(null),
    salaryMax: z.number().int().nonnegative().nullable().default(null),
    currency: z.enum(['RUR', 'USD', 'EUR']).default('RUR'),
    employment: z.string().max(50).default('full'),
    schedule: z.string().max(50).default(''),
    workFormat: z.enum(['REMOTE', 'HYBRID', 'ON_SITE', 'ANY']).default('REMOTE'),
    experience: z.string().max(50).default(''),
    minScore: z.number().int().min(0).max(100).default(75),
    dailyLimit: z.number().int().min(1).max(200).default(10),
    intervalMinutes: z.number().int().min(15).max(10080).default(60),
    mode: z.enum(['AUTO', 'APPROVAL']).default('APPROVAL'),
    letterPolicy: z.enum(['NEVER', 'ALWAYS', 'AI']).default('AI'),
    blacklist: list,
    whitelist: list,
    weights: weightsSchema.default(defaultWeights),
    resumeIds: z.array(z.string()).min(1).max(20),
  })
  .refine(
    (v) => !v.salaryMin || !v.salaryMax || v.salaryMin <= v.salaryMax,
    'Неверный диапазон зарплаты',
  );
export const resumeSchema = z.object({
  title: z.string().trim().min(2).max(200),
  externalId: z.string().max(100).nullable().default(null),
  content: z.string().trim().min(30).max(30000),
  skills: list,
  salary: z.number().int().nonnegative().nullable().default(null),
  currency: z.enum(['RUR', 'USD', 'EUR']).default('RUR'),
  employment: z.string().max(50).default('full'),
  workFormat: z.string().max(50).default('REMOTE'),
  geography: z.string().max(200).default(''),
});
export const candidateSchema = z.object({
  facts: z.string().max(20000),
  english: z.string().max(100).default(''),
  salary: z.number().int().nonnegative().nullable().default(null),
  relocate: z.boolean().default(false),
  travel: z.boolean().default(false),
  preferences: z.string().max(5000).default(''),
  constraints: z.string().max(5000).default(''),
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        years: z.number().min(0).max(60),
        evidence: z.string().trim().min(3).max(2000),
      }),
    )
    .max(100),
});
export const providerSchema = z.object({
  purpose: z.enum(['ANALYSIS', 'LETTER', 'CLASSIFICATION', 'SCREENING']),
  provider: z.enum(['OPENAI', 'OLLAMA']),
  baseUrl: z.string().url().max(500),
  apiKey: z.string().max(2000).optional(),
  model: z.string().min(1).max(150),
  temperature: z.number().min(0).max(1).default(0.2),
  maxTokens: z.number().int().min(100).max(16000).default(1800),
  language: z.enum(['ru', 'en']).default('ru'),
  instructions: z.string().max(5000).default(''),
  dailyBudget: z.number().min(0).max(1000).default(1),
  inputPrice: z.number().min(0).max(1000).default(0),
  outputPrice: z.number().min(0).max(1000).default(0),
});
export const settingsSchema = z
  .object({
    dryRun: z.boolean(),
    dailyLimit: z.number().int().min(1).max(200),
    employerLimit: z.number().int().min(1).max(100),
    activeStart: z.number().int().min(0).max(23),
    activeEnd: z.number().int().min(1).max(24),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Неверный часовой пояс'),
    letterInstructions: z.string().max(5000),
    smtpHost: z.string().max(253),
    smtpPort: z.number().int().min(1).max(65535),
    smtpUser: z.string().max(320),
    smtpSecret: z.string().max(1000).optional(),
    smtpTls: z.boolean(),
    smtpFrom: z.union([z.literal(''), z.string().email()]),
    notificationTypes: z
      .array(z.enum(['TASK', 'INVITATION', 'MESSAGE', 'AUTH', 'PAUSE', 'LIMIT', 'DIGEST']))
      .max(7),
    blacklist: list,
    blockedVacancies: list,
  })
  .refine(
    (v) => v.activeStart < v.activeEnd,
    'Начало часов активности должно быть раньше окончания',
  );
export const analysisSchema = z.object({
  decision: z.enum(['apply', 'skip', 'review']),
  matchingSkills: z.array(z.string()).max(30),
  missingSkills: z.array(z.string()).max(30),
  advantages: z.array(z.string()).max(10),
  risks: z.array(z.string()).max(10),
  recommendedResumeId: z.string(),
  reason: z.string().min(1).max(3000),
  confidence: z.number().min(0).max(1),
  components: z.object({
    stack: z.number().min(0).max(100),
    experience: z.number().min(0).max(100),
    salary: z.number().min(0).max(100),
    format: z.number().min(0).max(100),
    duties: z.number().min(0).max(100),
    preferences: z.number().min(0).max(100),
  }),
});
export const letterSchema = z.object({
  sentences: z
    .array(z.object({ text: z.string().min(1).max(1000), factIds: z.array(z.string()) }))
    .min(3)
    .max(7),
});
export const screeningSchema = z.object({
  category: z.enum(['FACTUAL', 'TECHNICAL', 'ASSIGNMENT', 'PERSONAL', 'UNKNOWN']),
  answer: z.string().max(6000).nullable(),
  factIds: z.array(z.string()),
  reason: z.string(),
  deadline: z.string().datetime().nullable(),
  technologies: z.array(z.string()),
  materials: z.array(z.string().url()).max(20),
});
export const messageSchema = z.object({
  category: z.enum([
    'VIEWED',
    'REJECTION',
    'INVITATION',
    'MESSAGE',
    'ASSIGNMENT',
    'INTERVIEW',
    'INFORMATION',
  ]),
  priority: z.enum(['NORMAL', 'HIGH']),
  reason: z.string().max(3000),
  deadline: z.string().datetime().nullable().default(null),
  technologies: z.array(z.string()).max(30).default([]),
  materials: z.array(z.string().url()).max(20).default([]),
  screeningType: z.enum(['ASSIGNMENT', 'PERSONAL', 'UNKNOWN']).default('UNKNOWN'),
});
