-- CreateTable
CREATE TABLE "AlertRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "method" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "smsBody" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertRecipient_userId_key" ON "AlertRecipient"("userId");

-- CreateIndex
CREATE INDEX "AlertRecipient_method_idx" ON "AlertRecipient"("method");
