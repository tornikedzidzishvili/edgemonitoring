-- AlterTable
ALTER TABLE "SharedHostingDomain" ADD COLUMN "customerEmail" TEXT;
ALTER TABLE "SharedHostingDomain" ADD COLUMN "customerName" TEXT;

-- CreateTable
CREATE TABLE "SharedHostingServer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'plesk',
    "apiUrl" TEXT,
    "apiKeyEnc" TEXT,
    "apiKeyIv" TEXT,
    "apiKeyTag" TEXT,
    "usernameEnc" TEXT,
    "usernameIv" TEXT,
    "usernameTag" TEXT,
    "passwordEnc" TEXT,
    "passwordIv" TEXT,
    "passwordTag" TEXT,
    "syncAll" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "lastSyncError" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SharedHosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serverId" TEXT,
    "pleskCustomerId" TEXT,
    "pleskLogin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedHosting_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "SharedHostingServer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SharedHosting" ("createdAt", "id", "name") SELECT "createdAt", "id", "name" FROM "SharedHosting";
DROP TABLE "SharedHosting";
ALTER TABLE "new_SharedHosting" RENAME TO "SharedHosting";
CREATE INDEX "SharedHosting_serverId_idx" ON "SharedHosting"("serverId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
