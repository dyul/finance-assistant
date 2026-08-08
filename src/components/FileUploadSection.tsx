import type { ChangeEvent } from "react";

import type {
  SheetDetectionResult,
} from "../services/transactionSheetDetector";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  type AnalysisMode,
} from "./fileUploadPresentation";

interface FileUploadSectionProps {
  fileName: string;
  fileSize: string;
  sheetNames: string[];
  sheetDetection: SheetDetectionResult | null;
  automaticSheetDetection: SheetDetectionResult | null;
  analysisMode: AnalysisMode | null;
  error: string;
  isProcessingFile: boolean;
  manualMappingOpen: boolean;
  canConfigureManual: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleManualMapping: () => void;
  onReturnToAutomatic: () => void;
}

export default function FileUploadSection({
  fileName,
  fileSize,
  sheetNames,
  sheetDetection,
  automaticSheetDetection,
  analysisMode,
  error,
  isProcessingFile,
  manualMappingOpen,
  canConfigureManual,
  onFileChange,
  onToggleManualMapping,
  onReturnToAutomatic,
}: FileUploadSectionProps) {
  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">
          엑셀 업로드
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          평소 사용하던 재무 엑셀을 그대로 올려주세요.
        </p>
      </div>

      <label
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
          isProcessingFile
            ? "cursor-wait border-blue-300 bg-blue-50"
            : "cursor-pointer border-slate-300 hover:border-blue-400 hover:bg-blue-50"
        }`}
      >
        <span className="font-medium text-slate-700">
          {isProcessingFile
            ? "파일을 분석하고 있습니다..."
            : "엑셀 파일 선택"}
        </span>
        <span className="mt-1 text-sm text-slate-500">
          .xlsx 또는 .xls 파일
        </span>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={onFileChange}
          disabled={isProcessingFile}
        />
      </label>

      {isProcessingFile && (
        <p className="mt-3 text-sm text-blue-700" role="status">
          Excel 분석 모듈을 불러오고 파일을 처리하는 중입니다.
        </p>
      )}

      {error && (
        <p
          className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      {fileName && (
        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <dt className="text-slate-500">파일명</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {fileName}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">파일 크기</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {fileSize}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">시트 수</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {sheetNames.length}개
              </dd>
            </div>

            {analysisMode && (
              <div>
                <dt className="text-slate-500">분석 방식</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {analysisMode === "automatic" ? "자동" : "수동"}
                </dd>
              </div>
            )}

            {sheetDetection && (
              <>
                <div>
                  <dt className="text-slate-500">분석 시트</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {sheetDetection.sheetName}
                    {analysisMode === "manual" && (
                      <span className="ml-2 text-xs text-slate-500">
                        헤더 {sheetDetection.headerRowIndex + 1}행
                      </span>
                    )}
                  </dd>
                </div>

                {analysisMode === "automatic" && (
                  <div>
                    <dt className="text-slate-500">자동 선택 신뢰도</dt>
                    <dd className="mt-1">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getConfidenceStyle(
                          sheetDetection.confidence,
                        )}`}
                      >
                        {getConfidenceLabel(sheetDetection.confidence)}
                      </span>
                    </dd>
                  </div>
                )}
              </>
            )}
          </dl>

          {sheetDetection && (
            <p className="mt-4 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600">
              {sheetDetection.reasons.join(" · ")}
            </p>
          )}

          {canConfigureManual && (
            <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={onToggleManualMapping}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  automaticSheetDetection === null
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : automaticSheetDetection.confidence !== "high"
                      ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {manualMappingOpen
                  ? "직접 설정 닫기"
                  : automaticSheetDetection
                    ? automaticSheetDetection.confidence === "high"
                      ? "자동 인식 수정"
                      : "자동 인식 결과 직접 확인"
                    : "직접 설정해서 분석"}
              </button>

              {analysisMode === "manual" && automaticSheetDetection && (
                <button
                  type="button"
                  onClick={onReturnToAutomatic}
                  className="rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                >
                  자동 인식으로 되돌리기
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
