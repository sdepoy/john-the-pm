-- CreateTable: Team
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TeamMember
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Project
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" TEXT NOT NULL DEFAULT 'discovery',
    "context" JSONB NOT NULL DEFAULT '{}',
    "plan" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Milestone
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Task
-- Note: content_hash is a GENERATED ALWAYS AS STORED computed column for deduplication.
-- It hashes (lower(title), project_id, milestone_id) to prevent duplicate task creation
-- across concurrent John conversations. A unique index on content_hash enforces this.
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unassigned',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dueDate" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "content_hash" TEXT GENERATED ALWAYS AS (
        md5(lower("title") || '::' || "projectId"::text || '::' || COALESCE("milestoneId"::text, ''))
    ) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Thread
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT,
    "summaryAt" INTEGER,
    "pendingProposal" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Message
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "tokenCount" INTEGER,
    "summarized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Invitation
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: User (Auth.js compatible)
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Account (Auth.js)
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Session (Auth.js) — extended with teamId/teamRole to avoid per-request lookup
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "teamId" TEXT,
    "teamRole" TEXT,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VerificationToken (Auth.js)
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- ─── Unique Constraints ───────────────────────────────────────────────────────
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_userId_key" UNIQUE ("teamId", "userId");
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_projectId_userId_key" UNIQUE ("projectId", "userId");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_token_key" UNIQUE ("token");
ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");
ALTER TABLE "Account" ADD CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId");
ALTER TABLE "Session" ADD CONSTRAINT "Session_sessionToken_key" UNIQUE ("sessionToken");
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_token_key" UNIQUE ("token");
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token");

-- Task deduplication: unique index on content_hash prevents duplicate tasks per project/milestone
CREATE UNIQUE INDEX "Task_content_hash_key" ON "Task"("content_hash");

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE INDEX "Project_teamId_idx" ON "Project"("teamId");
CREATE INDEX "Project_teamId_status_idx" ON "Project"("teamId", "status");
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId", "status");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Thread_projectId_idx" ON "Thread"("projectId");
CREATE INDEX "Thread_userId_idx" ON "Thread"("userId");
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");
CREATE INDEX "Message_threadId_summarized_idx" ON "Message"("threadId", "summarized");
CREATE INDEX "Invitation_teamId_email_idx" ON "Invitation"("teamId", "email");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- ─── Foreign Keys ─────────────────────────────────────────────────────────────
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Postgres NOTIFY Trigger ──────────────────────────────────────────────────
-- Fires pg_notify on every UPDATE to "Project", enabling SSE fan-out to
-- dashboard viewers via per-connection LISTEN subscriptions (Unit 7).

CREATE OR REPLACE FUNCTION notify_project_update()
RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify(
        'project_' || NEW.id,
        json_build_object(
            'id', NEW.id,
            'version', NEW.version,
            'status', NEW.status,
            'updatedAt', extract(epoch from now())::bigint
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_update_notify
AFTER UPDATE ON "Project"
FOR EACH ROW
EXECUTE FUNCTION notify_project_update();
