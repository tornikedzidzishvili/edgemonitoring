/*
  Warnings:

  - You are about to drop the column `password` on the `SmtpSettings` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Passkey_credentialId_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServerReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    CONSTRAINT "ServerReport_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServerReport" ("id", "payload", "reportedAt", "serverId") SELECT "id", "payload", "reportedAt", "serverId" FROM "ServerReport";
DROP TABLE "ServerReport";
ALTER TABLE "new_ServerReport" RENAME TO "ServerReport";
CREATE INDEX "ServerReport_serverId_reportedAt_idx" ON "ServerReport"("serverId", "reportedAt");
CREATE TABLE "new_SmtpSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "passwordEnc" TEXT,
    "passwordIv" TEXT,
    "passwordTag" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SmtpSettings" ("fromEmail", "fromName", "host", "id", "port", "secure", "updatedAt", "username") SELECT "fromEmail", "fromName", "host", "id", "port", "secure", "updatedAt", "username" FROM "SmtpSettings";
DROP TABLE "SmtpSettings";
ALTER TABLE "new_SmtpSettings" RENAME TO "SmtpSettings";
CREATE TABLE "new_UptimeCheckResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webAppId" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "error" TEXT,
    CONSTRAINT "UptimeCheckResult_webAppId_fkey" FOREIGN KEY ("webAppId") REFERENCES "WebApp" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UptimeCheckResult" ("checkedAt", "error", "httpStatus", "id", "ok", "responseTimeMs", "webAppId") SELECT "checkedAt", "error", "httpStatus", "id", "ok", "responseTimeMs", "webAppId" FROM "UptimeCheckResult";
DROP TABLE "UptimeCheckResult";
ALTER TABLE "new_UptimeCheckResult" RENAME TO "UptimeCheckResult";
CREATE INDEX "UptimeCheckResult_webAppId_checkedAt_idx" ON "UptimeCheckResult"("webAppId", "checkedAt");
CREATE INDEX "UptimeCheckResult_ok_checkedAt_idx" ON "UptimeCheckResult"("ok", "checkedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Server_apiKeyHash_idx" ON "Server"("apiKeyHash");
