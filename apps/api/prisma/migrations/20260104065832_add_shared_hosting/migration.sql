-- CreateTable
CREATE TABLE "SharedHosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SharedHostingDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sharedHostingId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sslExpiresAt" DATETIME,
    "sslIssuer" TEXT,
    "sslLastChecked" DATETIME,
    "lastKnownIp" TEXT,
    "dnsLastChecked" DATETIME,
    CONSTRAINT "SharedHostingDomain_sharedHostingId_fkey" FOREIGN KEY ("sharedHostingId") REFERENCES "SharedHosting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DomainCheckResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpOk" BOOLEAN,
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "httpError" TEXT,
    "currentIp" TEXT,
    "ipChanged" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DomainCheckResult_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "SharedHostingDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SharedHostingDomain_sharedHostingId_idx" ON "SharedHostingDomain"("sharedHostingId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedHostingDomain_sharedHostingId_domain_key" ON "SharedHostingDomain"("sharedHostingId", "domain");

-- CreateIndex
CREATE INDEX "DomainCheckResult_domainId_checkedAt_idx" ON "DomainCheckResult"("domainId", "checkedAt");
