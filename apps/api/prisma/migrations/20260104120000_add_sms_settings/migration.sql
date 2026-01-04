-- CreateTable
CREATE TABLE "SmsSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKeyEnc" TEXT,
    "apiKeyIv" TEXT,
    "apiKeyTag" TEXT,
    "updatedAt" DATETIME NOT NULL
);
