-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Server" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ip" TEXT,
    "vendor" TEXT,
    "specs" JSONB,
    "sshUser" TEXT,
    "sshPort" INTEGER,
    "sshKeyId" TEXT,
    "apiKeyHash" TEXT,
    "monitoringMode" TEXT NOT NULL DEFAULT 'agent',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME,
    CONSTRAINT "Server_sshKeyId_fkey" FOREIGN KEY ("sshKeyId") REFERENCES "SshKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Server" ("apiKeyHash", "createdAt", "id", "ip", "lastSeenAt", "name", "specs", "sshKeyId", "sshPort", "sshUser", "vendor") SELECT "apiKeyHash", "createdAt", "id", "ip", "lastSeenAt", "name", "specs", "sshKeyId", "sshPort", "sshUser", "vendor" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
CREATE INDEX "Server_apiKeyHash_idx" ON "Server"("apiKeyHash");
CREATE TABLE "new_ServerReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "payload" JSONB NOT NULL,
    CONSTRAINT "ServerReport_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServerReport" ("id", "payload", "reportedAt", "serverId") SELECT "id", "payload", "reportedAt", "serverId" FROM "ServerReport";
DROP TABLE "ServerReport";
ALTER TABLE "new_ServerReport" RENAME TO "ServerReport";
CREATE INDEX "ServerReport_serverId_reportedAt_idx" ON "ServerReport"("serverId", "reportedAt");
CREATE INDEX "ServerReport_reportedAt_idx" ON "ServerReport"("reportedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
