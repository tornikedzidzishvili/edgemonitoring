-- AlterTable
ALTER TABLE "SharedHostingDomain" ADD COLUMN "serviceStatus" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SharedHostingServer" (
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
    "sshKeyId" TEXT,
    "sshUser" TEXT,
    "sshPort" INTEGER,
    "syncAll" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "lastSyncError" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SharedHostingServer_sshKeyId_fkey" FOREIGN KEY ("sshKeyId") REFERENCES "SshKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SharedHostingServer" ("apiKeyEnc", "apiKeyIv", "apiKeyTag", "apiUrl", "createdAt", "enabled", "id", "lastSyncAt", "lastSyncError", "name", "passwordEnc", "passwordIv", "passwordTag", "syncAll", "type", "updatedAt", "usernameEnc", "usernameIv", "usernameTag") SELECT "apiKeyEnc", "apiKeyIv", "apiKeyTag", "apiUrl", "createdAt", "enabled", "id", "lastSyncAt", "lastSyncError", "name", "passwordEnc", "passwordIv", "passwordTag", "syncAll", "type", "updatedAt", "usernameEnc", "usernameIv", "usernameTag" FROM "SharedHostingServer";
DROP TABLE "SharedHostingServer";
ALTER TABLE "new_SharedHostingServer" RENAME TO "SharedHostingServer";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
