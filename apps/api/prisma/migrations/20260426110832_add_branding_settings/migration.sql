-- CreateTable
CREATE TABLE "BrandingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformName" TEXT NOT NULL DEFAULT 'Edge Monitor',
    "logoPath" TEXT,
    "logoMimeType" TEXT,
    "faviconPath" TEXT,
    "faviconMime" TEXT,
    "updatedAt" DATETIME NOT NULL
);
