-- One tap on a cell of the child's AAC talking screen. Light log for therapist stats + parent weekly summary.
CREATE TABLE "AacCellTap" (
    "id" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "kidId" UUID NOT NULL,
    "cellId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "wordClass" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'word',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AacCellTap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AacCellTap_kidId_at_idx" ON "AacCellTap"("kidId", "at");
CREATE INDEX "AacCellTap_boardId_at_idx" ON "AacCellTap"("boardId", "at");

ALTER TABLE "AacCellTap" ADD CONSTRAINT "AacCellTap_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "AacBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AacCellTap" ADD CONSTRAINT "AacCellTap_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
