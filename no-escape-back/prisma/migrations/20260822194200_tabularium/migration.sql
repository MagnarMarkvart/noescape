-- Tabularium clicker tallies (period counts with a normal band).
CREATE TABLE "Tabula" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "period" TEXT NOT NULL DEFAULT 'day',
    "polarity" TEXT NOT NULL DEFAULT 'vice',
    "normMin" INTEGER NOT NULL DEFAULT 0,
    "normMax" INTEGER NOT NULL DEFAULT 0,
    "step" INTEGER NOT NULL DEFAULT 1,
    "questId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tabula_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "TabulaClick" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tabulaId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "delta" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TabulaClick_tabulaId_fkey" FOREIGN KEY ("tabulaId") REFERENCES "Tabula" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Tabula_archived_idx" ON "Tabula"("archived");
CREATE INDEX "Tabula_questId_idx" ON "Tabula"("questId");
CREATE INDEX "TabulaClick_tabulaId_date_idx" ON "TabulaClick"("tabulaId", "date");
CREATE INDEX "TabulaClick_date_idx" ON "TabulaClick"("date");
