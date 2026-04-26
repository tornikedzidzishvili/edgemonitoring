-- CreateTable
CREATE TABLE "SharedHostingAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "lastNotifiedAt" DATETIME,
    "notificationCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SharedHostingAlert_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "SharedHostingServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SharedHostingAlert_serverId_status_idx" ON "SharedHostingAlert"("serverId", "status");

-- CreateIndex
CREATE INDEX "SharedHostingAlert_status_triggeredAt_idx" ON "SharedHostingAlert"("status", "triggeredAt");
