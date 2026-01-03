-- CreateTable
CREATE TABLE "ServerMetricMinute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "minuteStart" DATETIME NOT NULL,
    "cpuLoadSum" REAL NOT NULL DEFAULT 0,
    "memUsedPctSum" REAL NOT NULL DEFAULT 0,
    "samples" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ServerMetricMinute_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerMetricMinute_serverId_minuteStart_key" ON "ServerMetricMinute"("serverId", "minuteStart");

-- CreateIndex
CREATE INDEX "ServerMetricMinute_serverId_minuteStart_idx" ON "ServerMetricMinute"("serverId", "minuteStart");
