-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'ENGINEER', 'PLANNER', 'SAFETY', 'COORDINATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "MethodStatementStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "GapItemStatus" AS ENUM ('CONFIRMED_BY_DOCUMENT', 'CONFIRMED_BY_USER', 'SUGGESTED_FROM_PRECEDENT', 'CONFLICT', 'NOT_APPLICABLE', 'TO_BE_CONFIRMED', 'MISSING');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('PROJECT_DOC_VS_PRECEDENT', 'DRAWING_VS_PRECEDENT', 'USER_INPUT_VS_RETRIEVED', 'PRECEDENT_VS_PRECEDENT', 'DRAFT_VS_CONFIRMED');

-- CreateEnum
CREATE TYPE "ConflictResolution" AS ENUM ('ACCEPT_CURRENT', 'ACCEPT_PRECEDENT', 'MANUAL_EDIT', 'UNRESOLVED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'SPECIFICATION', 'DRAWING', 'RISK_ASSESSMENT', 'PROGRAMME', 'SITE_CONSTRAINTS', 'HISTORICAL_MS', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETE', 'ERROR', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VisualType" AS ENUM ('TABLE', 'CHART', 'DIAGRAM', 'GRAPHIC');

-- CreateEnum
CREATE TYPE "SourcePool" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "WorkerJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SectionStatus" AS ENUM ('NOT_STARTED', 'DRAFTING', 'DRAFT', 'IN_REVIEW', 'APPROVED');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organisationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradePack" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requiredFields" JSONB NOT NULL,
    "typicalSequences" JSONB NOT NULL,
    "commonPlant" JSONB NOT NULL,
    "commonLabour" JSONB NOT NULL,
    "commonMaterials" JSONB NOT NULL,
    "commonPermits" JSONB NOT NULL,
    "tempWorksConsiders" JSONB NOT NULL,
    "safetyHazards" JSONB NOT NULL,
    "envControls" JSONB NOT NULL,
    "qaQcChecks" JSONB NOT NULL,
    "holdPoints" JSONB NOT NULL,
    "standardVocabulary" JSONB NOT NULL,
    "conflictRules" JSONB NOT NULL,
    "gapQuestionBank" JSONB NOT NULL,

    CONSTRAINT "TradePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalMethodStatement" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "projectName" TEXT,
    "client" TEXT,
    "workType" TEXT,
    "approvalStatus" "DocumentStatus" NOT NULL DEFAULT 'COMPLETE',
    "version" TEXT,
    "documentDate" TIMESTAMP(3),
    "fileKey" TEXT NOT NULL,
    "fileSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "HistoricalMethodStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalMSTag" (
    "id" TEXT NOT NULL,
    "historicalMethodStatementId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HistoricalMSTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDocument" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'OTHER',
    "status" "DocumentStatus" NOT NULL DEFAULT 'QUEUED',
    "pageCount" INTEGER,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "extractionErrors" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "authorityRank" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePassage" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "historicalMSId" TEXT,
    "pageNumber" INTEGER,
    "sectionHeading" TEXT,
    "extractedText" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "imageStorageKey" TEXT,
    "embeddingModelVersion" TEXT NOT NULL,
    "embedding" vector(768),
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcePassage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetrievalResult" (
    "id" TEXT NOT NULL,
    "methodStatementId" TEXT NOT NULL,
    "historicalMSId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrievalResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MethodStatement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "activityId" TEXT,
    "tradePackId" TEXT,
    "title" TEXT NOT NULL,
    "status" "MethodStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewerOfRecord" TEXT,
    "briefGenerated" BOOLEAN NOT NULL DEFAULT false,
    "briefContent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MethodStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MethodStatementSection" (
    "id" TEXT NOT NULL,
    "methodStatementId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "sectionTitle" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "status" "SectionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "content" TEXT,
    "draftingNotes" TEXT,
    "specificityScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MethodStatementSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionVersion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prompt" TEXT,

    CONSTRAINT "SectionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GapItem" (
    "id" TEXT NOT NULL,
    "methodStatementId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "GapItemStatus" NOT NULL DEFAULT 'TO_BE_CONFIRMED',
    "answer" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "sourceDocumentRef" TEXT,
    "notApplicableReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GapItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictRecord" (
    "id" TEXT NOT NULL,
    "methodStatementId" TEXT NOT NULL,
    "conflictType" "ConflictType" NOT NULL,
    "topic" TEXT NOT NULL,
    "currentRequirement" TEXT NOT NULL,
    "conflictingContent" TEXT NOT NULL,
    "currentSourceRef" TEXT,
    "conflictingSourceRef" TEXT,
    "precedentMSId" TEXT,
    "recommendedAction" TEXT,
    "resolution" "ConflictResolution" NOT NULL DEFAULT 'UNRESOLVED',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceMarker" (
    "id" TEXT NOT NULL,
    "methodStatementId" TEXT NOT NULL,
    "sectionId" TEXT,
    "positionInSection" INTEGER,
    "pool" "SourcePool" NOT NULL,
    "sourceDocumentId" TEXT,
    "sourcePassageId" TEXT,
    "sourcePassageExcerpt" TEXT,
    "sourcePageOrSection" TEXT,
    "indexNumber" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReferenceMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppendixRecord" (
    "id" TEXT NOT NULL,
    "methodStatementId" TEXT NOT NULL,
    "pool" "SourcePool" NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "includedInExport" BOOLEAN NOT NULL DEFAULT true,
    "exportRecordId" TEXT,

    CONSTRAINT "AppendixRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visual" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "visualType" "VisualType" NOT NULL,
    "title" TEXT,
    "sourceSection" TEXT,
    "sourceTextSnapshot" TEXT,
    "generatedPrompt" TEXT,
    "editedPrompt" TEXT,
    "engineUsed" TEXT,
    "engineVersion" TEXT,
    "structuredData" JSONB,
    "mermaidSource" TEXT,
    "imageStorageKey" TEXT,
    "isSchematicOnly" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByUser" BOOLEAN NOT NULL DEFAULT false,
    "insertionOrder" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportRecord" (
    "id" TEXT NOT NULL,
    "methodStatementId" TEXT NOT NULL,
    "exportedBy" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileKey" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "inputVersionSnapshot" JSONB NOT NULL,
    "unresolvedGapCount" INTEGER NOT NULL DEFAULT 0,
    "unresolvedConflictCount" INTEGER NOT NULL DEFAULT 0,
    "specificityWarnings" INTEGER NOT NULL DEFAULT 0,
    "appendixAIncluded" BOOLEAN NOT NULL DEFAULT true,
    "appendixBIncluded" BOOLEAN NOT NULL DEFAULT true,
    "poolAMarkerCount" INTEGER NOT NULL DEFAULT 0,
    "poolBMarkerCount" INTEGER NOT NULL DEFAULT 0,
    "unresolvedItemsAppendix" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" "WorkerJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sourceDocumentId" TEXT,

    CONSTRAINT "WorkerJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyTerm" (
    "id" TEXT NOT NULL,
    "preferredTerm" TEXT NOT NULL,
    "prohibitedTerms" TEXT[],
    "tradeScope" TEXT[],
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICostRecord" (
    "id" TEXT NOT NULL,
    "methodStatementId" TEXT,
    "projectId" TEXT,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "embeddingUnits" INTEGER,
    "estimatedCostGbp" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");

-- CreateIndex
CREATE INDEX "Project_organisationId_idx" ON "Project"("organisationId");

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_name_key" ON "Trade"("name");

-- CreateIndex
CREATE INDEX "Activity_tradeId_idx" ON "Activity"("tradeId");

-- CreateIndex
CREATE INDEX "TradePack_tradeId_idx" ON "TradePack"("tradeId");

-- CreateIndex
CREATE INDEX "HistoricalMethodStatement_tradeId_idx" ON "HistoricalMethodStatement"("tradeId");

-- CreateIndex
CREATE INDEX "HistoricalMethodStatement_approvalStatus_idx" ON "HistoricalMethodStatement"("approvalStatus");

-- CreateIndex
CREATE INDEX "HistoricalMSTag_historicalMethodStatementId_idx" ON "HistoricalMSTag"("historicalMethodStatementId");

-- CreateIndex
CREATE INDEX "HistoricalMSTag_key_value_idx" ON "HistoricalMSTag"("key", "value");

-- CreateIndex
CREATE INDEX "ProjectDocument_projectId_idx" ON "ProjectDocument"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDocument_status_idx" ON "ProjectDocument"("status");

-- CreateIndex
CREATE INDEX "SourcePassage_sourceDocumentId_idx" ON "SourcePassage"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "SourcePassage_historicalMSId_idx" ON "SourcePassage"("historicalMSId");

-- CreateIndex
CREATE INDEX "RetrievalResult_methodStatementId_idx" ON "RetrievalResult"("methodStatementId");

-- CreateIndex
CREATE INDEX "MethodStatement_projectId_idx" ON "MethodStatement"("projectId");

-- CreateIndex
CREATE INDEX "MethodStatement_tradeId_idx" ON "MethodStatement"("tradeId");

-- CreateIndex
CREATE INDEX "MethodStatement_status_idx" ON "MethodStatement"("status");

-- CreateIndex
CREATE INDEX "MethodStatementSection_methodStatementId_idx" ON "MethodStatementSection"("methodStatementId");

-- CreateIndex
CREATE UNIQUE INDEX "MethodStatementSection_methodStatementId_sectionKey_key" ON "MethodStatementSection"("methodStatementId", "sectionKey");

-- CreateIndex
CREATE INDEX "SectionVersion_sectionId_idx" ON "SectionVersion"("sectionId");

-- CreateIndex
CREATE INDEX "GapItem_methodStatementId_idx" ON "GapItem"("methodStatementId");

-- CreateIndex
CREATE INDEX "GapItem_status_idx" ON "GapItem"("status");

-- CreateIndex
CREATE INDEX "ConflictRecord_methodStatementId_idx" ON "ConflictRecord"("methodStatementId");

-- CreateIndex
CREATE INDEX "ConflictRecord_resolution_idx" ON "ConflictRecord"("resolution");

-- CreateIndex
CREATE INDEX "ReferenceMarker_methodStatementId_idx" ON "ReferenceMarker"("methodStatementId");

-- CreateIndex
CREATE INDEX "ReferenceMarker_pool_idx" ON "ReferenceMarker"("pool");

-- CreateIndex
CREATE INDEX "AppendixRecord_methodStatementId_idx" ON "AppendixRecord"("methodStatementId");

-- CreateIndex
CREATE INDEX "Visual_sectionId_idx" ON "Visual"("sectionId");

-- CreateIndex
CREATE INDEX "ExportRecord_methodStatementId_idx" ON "ExportRecord"("methodStatementId");

-- CreateIndex
CREATE INDEX "Comment_sectionId_idx" ON "Comment"("sectionId");

-- CreateIndex
CREATE INDEX "WorkerJob_status_idx" ON "WorkerJob"("status");

-- CreateIndex
CREATE INDEX "WorkerJob_jobType_idx" ON "WorkerJob"("jobType");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_idx" ON "AuditLog"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "VocabularyTerm_category_idx" ON "VocabularyTerm"("category");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyTerm_preferredTerm_key" ON "VocabularyTerm"("preferredTerm");

-- CreateIndex
CREATE INDEX "AICostRecord_projectId_idx" ON "AICostRecord"("projectId");

-- CreateIndex
CREATE INDEX "AICostRecord_recordedAt_idx" ON "AICostRecord"("recordedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradePack" ADD CONSTRAINT "TradePack_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalMethodStatement" ADD CONSTRAINT "HistoricalMethodStatement_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalMSTag" ADD CONSTRAINT "HistoricalMSTag_historicalMethodStatementId_fkey" FOREIGN KEY ("historicalMethodStatementId") REFERENCES "HistoricalMethodStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePassage" ADD CONSTRAINT "SourcePassage_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePassage" ADD CONSTRAINT "SourcePassage_historicalMSId_fkey" FOREIGN KEY ("historicalMSId") REFERENCES "HistoricalMethodStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrievalResult" ADD CONSTRAINT "RetrievalResult_methodStatementId_fkey" FOREIGN KEY ("methodStatementId") REFERENCES "MethodStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrievalResult" ADD CONSTRAINT "RetrievalResult_historicalMSId_fkey" FOREIGN KEY ("historicalMSId") REFERENCES "HistoricalMethodStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodStatement" ADD CONSTRAINT "MethodStatement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodStatement" ADD CONSTRAINT "MethodStatement_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodStatement" ADD CONSTRAINT "MethodStatement_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodStatement" ADD CONSTRAINT "MethodStatement_tradePackId_fkey" FOREIGN KEY ("tradePackId") REFERENCES "TradePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MethodStatementSection" ADD CONSTRAINT "MethodStatementSection_methodStatementId_fkey" FOREIGN KEY ("methodStatementId") REFERENCES "MethodStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionVersion" ADD CONSTRAINT "SectionVersion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MethodStatementSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionVersion" ADD CONSTRAINT "SectionVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapItem" ADD CONSTRAINT "GapItem_methodStatementId_fkey" FOREIGN KEY ("methodStatementId") REFERENCES "MethodStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GapItem" ADD CONSTRAINT "GapItem_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictRecord" ADD CONSTRAINT "ConflictRecord_methodStatementId_fkey" FOREIGN KEY ("methodStatementId") REFERENCES "MethodStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictRecord" ADD CONSTRAINT "ConflictRecord_precedentMSId_fkey" FOREIGN KEY ("precedentMSId") REFERENCES "HistoricalMethodStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceMarker" ADD CONSTRAINT "ReferenceMarker_methodStatementId_fkey" FOREIGN KEY ("methodStatementId") REFERENCES "MethodStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceMarker" ADD CONSTRAINT "ReferenceMarker_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceMarker" ADD CONSTRAINT "ReferenceMarker_sourcePassageId_fkey" FOREIGN KEY ("sourcePassageId") REFERENCES "SourcePassage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceMarker" ADD CONSTRAINT "ReferenceMarker_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppendixRecord" ADD CONSTRAINT "AppendixRecord_methodStatementId_fkey" FOREIGN KEY ("methodStatementId") REFERENCES "MethodStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppendixRecord" ADD CONSTRAINT "AppendixRecord_exportRecordId_fkey" FOREIGN KEY ("exportRecordId") REFERENCES "ExportRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visual" ADD CONSTRAINT "Visual_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MethodStatementSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_methodStatementId_fkey" FOREIGN KEY ("methodStatementId") REFERENCES "MethodStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportRecord" ADD CONSTRAINT "ExportRecord_exportedBy_fkey" FOREIGN KEY ("exportedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MethodStatementSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerJob" ADD CONSTRAINT "WorkerJob_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
