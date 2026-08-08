import type { SheetDetectionConfidence } from "../services/transactionSheetDetector";

export type AnalysisMode = "automatic" | "manual";

export function getConfidenceLabel(
  confidence: SheetDetectionConfidence,
): string {
  if (confidence === "high") {
    return "높음";
  }

  if (confidence === "medium") {
    return "보통";
  }

  return "낮음";
}

export function getConfidenceStyle(
  confidence: SheetDetectionConfidence,
): string {
  if (confidence === "high") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (confidence === "medium") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-red-50 text-red-700";
}
