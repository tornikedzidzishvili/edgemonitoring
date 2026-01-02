-- CreateTable
CREATE TABLE "SshKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "port" INTEGER,
    "privateKeyEnc" TEXT NOT NULL,
    "privateKeyIv" TEXT NOT NULL,
    "privateKeyTag" TEXT NOT NULL,
    "passphraseEnc" TEXT,
    "passphraseIv" TEXT,
    "passphraseTag" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    "apiKeyHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME,
    CONSTRAINT "Server_sshKeyId_fkey" FOREIGN KEY ("sshKeyId") REFERENCES "SshKey" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Server" ("apiKeyHash", "createdAt", "id", "ip", "lastSeenAt", "name", "specs", "sshPort", "sshUser", "vendor") SELECT "apiKeyHash", "createdAt", "id", "ip", "lastSeenAt", "name", "specs", "sshPort", "sshUser", "vendor" FROM "Server";
DROP TABLE "Server";
ALTER TABLE "new_Server" RENAME TO "Server";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
