-- CreateTable
CREATE TABLE "ServerAlertSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cpuThresholdPct" INTEGER NOT NULL DEFAULT 90,
    "cpuDurationMin" INTEGER NOT NULL DEFAULT 5,
    "ramThresholdPct" INTEGER NOT NULL DEFAULT 90,
    "ramDurationMin" INTEGER NOT NULL DEFAULT 5,
    "offlineTimeoutMin" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ServerAlertConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "alertingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cpuThresholdPct" INTEGER,
    "cpuDurationMin" INTEGER,
    "ramThresholdPct" INTEGER,
    "ramDurationMin" INTEGER,
    "offlineTimeoutMin" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServerAlertConfig_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "thresholdValue" REAL,
    "actualValue" REAL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedById" TEXT,
    "lastNotifiedAt" DATETIME,
    "notificationCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ServerAlert_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerAlertConfig_serverId_key" ON "ServerAlertConfig"("serverId");

-- CreateIndex
CREATE INDEX "ServerAlert_serverId_status_idx" ON "ServerAlert"("serverId", "status");

-- CreateIndex
CREATE INDEX "ServerAlert_status_triggeredAt_idx" ON "ServerAlert"("status", "triggeredAt");
