-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DISCOVERED', 'ANALYZING', 'READY_TO_APPLY', 'AWAITING_APPROVAL', 'APPLYING', 'APPLIED', 'FAILED', 'SKIPPED', 'REQUIRES_USER_ACTION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HhAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HhAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facts" TEXT NOT NULL DEFAULT '',
    "english" TEXT NOT NULL DEFAULT '',
    "salary" INTEGER,
    "relocate" BOOLEAN NOT NULL DEFAULT false,
    "travel" BOOLEAN NOT NULL DEFAULT false,
    "preferences" TEXT NOT NULL DEFAULT '',
    "constraints" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSkill" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "years" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT NOT NULL,

    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "skills" TEXT[],
    "salary" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUR',
    "employment" TEXT NOT NULL DEFAULT 'full',
    "workFormat" TEXT NOT NULL DEFAULT 'REMOTE',
    "geography" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'USER_CONFIRMED',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "query" TEXT NOT NULL,
    "exclude" TEXT[],
    "area" TEXT NOT NULL DEFAULT '113',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUR',
    "employment" TEXT NOT NULL DEFAULT 'full',
    "schedule" TEXT NOT NULL DEFAULT '',
    "workFormat" TEXT NOT NULL DEFAULT 'REMOTE',
    "experience" TEXT NOT NULL DEFAULT '',
    "minScore" INTEGER NOT NULL DEFAULT 75,
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "mode" TEXT NOT NULL DEFAULT 'APPROVAL',
    "letterPolicy" TEXT NOT NULL DEFAULT 'AI',
    "blacklist" TEXT[],
    "whitelist" TEXT[],
    "weights" JSONB NOT NULL DEFAULT '{"stack":30,"experience":20,"salary":20,"format":15,"duties":10,"preferences":5}',
    "lastScanAt" TIMESTAMP(3),
    "nextScanAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchProfileResume" (
    "searchId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,

    CONSTRAINT "SearchProfileResume_pkey" PRIMARY KEY ("searchId","resumeId")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "salaryFrom" INTEGER,
    "salaryTo" INTEGER,
    "currency" TEXT,
    "workFormats" TEXT[],
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "requiresLetter" BOOLEAN NOT NULL DEFAULT false,
    "hasTest" BOOLEAN NOT NULL DEFAULT false,
    "externalResponse" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "resumeId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DISCOVERED',
    "pipeline" TEXT NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "resultSource" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "error" TEXT,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacancyAnalysis" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverLetter" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "factIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningQuestion" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "materials" TEXT[],
    "deadline" TIMESTAMP(3),
    "technologies" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "factIds" TEXT[],
    "approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ScreeningAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployerMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '/attention',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProviderConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'OPENAI',
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "maxTokens" INTEGER NOT NULL DEFAULT 1800,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "instructions" TEXT NOT NULL DEFAULT '',
    "dailyBudget" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "inputPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AIProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "reservedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "userId" TEXT NOT NULL,
    "agentState" TEXT NOT NULL DEFAULT 'STOPPED',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "employerLimit" INTEGER NOT NULL DEFAULT 2,
    "activeStart" INTEGER NOT NULL DEFAULT 9,
    "activeEnd" INTEGER NOT NULL DEFAULT 19,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "letterInstructions" TEXT NOT NULL DEFAULT '',
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpSecret" TEXT,
    "smtpTls" BOOLEAN NOT NULL DEFAULT true,
    "smtpFrom" TEXT NOT NULL DEFAULT '',
    "notificationTypes" TEXT[] DEFAULT ARRAY['TASK', 'INVITATION', 'MESSAGE', 'AUTH', 'PAUSE', 'LIMIT', 'DIGEST']::TEXT[],
    "lastDigestDate" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "blacklist" TEXT[],
    "blockedVacancies" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ChatCursor" (
    "id" TEXT NOT NULL,
    "lastMessageId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HhAccount_userId_key" ON "HhAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HhAccount_externalId_key" ON "HhAccount"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSkill_profileId_name_key" ON "CandidateSkill"("profileId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_userId_externalId_key" ON "Resume"("userId", "externalId");

-- CreateIndex
CREATE INDEX "SearchProfile_active_nextScanAt_idx" ON "SearchProfile"("active", "nextScanAt");

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_userId_vacancyId_key" ON "Application"("userId", "vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_userId_vacancyId_resumeId_key" ON "Application"("userId", "vacancyId", "resumeId");

-- CreateIndex
CREATE UNIQUE INDEX "VacancyAnalysis_applicationId_key" ON "VacancyAnalysis"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "CoverLetter_applicationId_key" ON "CoverLetter"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningAnswer_questionId_key" ON "ScreeningAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployerMessage_userId_externalId_key" ON "EmployerMessage"("userId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTask_dedupeKey_key" ON "UserTask"("dedupeKey");

-- CreateIndex
CREATE INDEX "UserTask_userId_completedAt_idx" ON "UserTask"("userId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "AgentEvent_userId_createdAt_idx" ON "AgentEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIProviderConfig_userId_purpose_key" ON "AIProviderConfig"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AIUsage_configId_createdAt_idx" ON "AIUsage"("configId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAttempt" ADD CONSTRAINT "OAuthAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HhAccount" ADD CONSTRAINT "HhAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProfile" ADD CONSTRAINT "SearchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProfileResume" ADD CONSTRAINT "SearchProfileResume_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "SearchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchProfileResume" ADD CONSTRAINT "SearchProfileResume_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "SearchProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyAnalysis" ADD CONSTRAINT "VacancyAnalysis_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningQuestion" ADD CONSTRAINT "ScreeningQuestion_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningAnswer" ADD CONSTRAINT "ScreeningAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ScreeningQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployerMessage" ADD CONSTRAINT "EmployerMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProviderConfig" ADD CONSTRAINT "AIProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AIProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

