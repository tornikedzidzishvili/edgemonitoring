-- CreateTable
CREATE TABLE "AgentInstallSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registryUrl" TEXT NOT NULL DEFAULT 'ghcr.io',
    "username" TEXT,
    "tokenEnc" TEXT,
    "tokenIv" TEXT,
    "tokenTag" TEXT,
    "updatedAt" DATETIME NOT NULL
);
