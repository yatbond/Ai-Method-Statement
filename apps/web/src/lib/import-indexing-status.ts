export type IndexingStage =
  | "NO_PASSAGES"
  | "EMBEDDINGS_MISSING"
  | "PARTIAL"
  | "READY";

export type IndexingStatus = {
  stage: IndexingStage;
  ready: boolean;
  passageCount: number;
  embeddedCount: number;
  missingCount: number;
  modelVersion: string | null;
  message: string;
};

export function buildIndexingStatus(input: {
  passageCount: number;
  embeddedCount: number;
  modelVersion?: string | null;
}): IndexingStatus {
  const passageCount = Math.max(0, input.passageCount);
  const embeddedCount = Math.max(0, Math.min(input.embeddedCount, passageCount));
  const missingCount = passageCount - embeddedCount;
  const modelVersion = input.modelVersion ?? null;

  if (passageCount === 0) {
    return {
      stage: "NO_PASSAGES",
      ready: false,
      passageCount,
      embeddedCount,
      missingCount,
      modelVersion,
      message: "No passages have been extracted yet.",
    };
  }

  if (embeddedCount === 0) {
    return {
      stage: "EMBEDDINGS_MISSING",
      ready: false,
      passageCount,
      embeddedCount,
      missingCount,
      modelVersion,
      message: "OCR complete, but retrieval embeddings are missing.",
    };
  }

  if (missingCount > 0) {
    return {
      stage: "PARTIAL",
      ready: false,
      passageCount,
      embeddedCount,
      missingCount,
      modelVersion,
      message: `${embeddedCount} of ${passageCount} passages are indexed for retrieval.`,
    };
  }

  return {
    stage: "READY",
    ready: true,
    passageCount,
    embeddedCount,
    missingCount,
    modelVersion,
    message: "OCR and retrieval indexing are complete.",
  };
}
