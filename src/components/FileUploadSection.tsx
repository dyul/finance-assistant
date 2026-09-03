import type { ChangeEvent } from "react";

import type {
  SheetDetectionResult,
} from "../services/transactionSheetDetector";
import { MAX_EXCEL_FILE_SIZE_LABEL } from "../services/excelUploadValidation";
import type {
  TransactionSourceType,
  TransactionTextEncoding,
} from "../services/transactionDataSource";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  type AnalysisMode,
} from "./fileUploadPresentation";

interface FileUploadSectionProps {
  fileName: string;
  fileSize: string;
  sourceType: TransactionSourceType | null;
  textEncoding?: TransactionTextEncoding;
  sheetNames: string[];
  sheetDetection: SheetDetectionResult | null;
  automaticSheetDetection: SheetDetectionResult | null;
  analysisMode: AnalysisMode | null;
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
  sourceType,
  textEncoding,
  sheetNames,
  sheetDetection,
  automaticSheetDetection,
  analysisMode,
  isProcessingFile,
  manualMappingOpen,
  canConfigureManual,
  onFileChange,
  onToggleManualMapping,
  onReturnToAutomatic,
}: FileUploadSectionProps) {
  return (
    <section id="file-upload" aria-labelledby="file-upload-heading">
      <div className="mb-5">
        <h2
          id="file-upload-heading"
          className="text-lg font-semibold text-slate-900"
        >
          거래내역 파일 업로드
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          은행에서 받은 거래내역, 가계부 앱에서 내보낸 파일, 직접 관리하는
          Excel 또는 CSV를 올려주세요.
        </p>
      </div>

      <label
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 ${
          isProcessingFile
            ? "cursor-wait border-blue-300 bg-blue-50"
            : "cursor-pointer border-slate-300 hover:border-blue-400 hover:bg-blue-50"
        }`}
      >
        <span className="font-medium text-slate-700">
          {isProcessingFile
            ? "파일을 분석하고 있습니다..."
            : "Excel / CSV 파일 선택"}
        </span>
        <span className="mt-1 text-sm text-slate-500">
          .xlsx · .xls · .csv 파일 · 최대 {MAX_EXCEL_FILE_SIZE_LABEL} · 현재 한
          번에 1개 파일
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          onChange={onFileChange}
          disabled={isProcessingFile}
        />
      </label>

      {isProcessingFile && (
        <p className="mt-3 text-sm text-blue-700" role="status">
          파일을 읽고 거래내역을 분석하는 중입니다.
        </p>
      )}

      <div
        className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600"
        role="note"
      >
        <p>
          업로드한 파일은 서버로 전송하지 않고 현재 브라우저에서
          분석합니다. 원본 거래내역은 브라우저 저장소에 저장하지 않습니다.
        </p>
        <p className="mt-1">
          확정 예정 거래와 선택 예상 범위만 파일명 기준으로 이 브라우저에
          저장될 수 있습니다.
        </p>
      </div>

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
              <dt className="text-slate-500">
                {sourceType === "csv" ? "파일 형식" : "시트 수"}
              </dt>
              <dd className="mt-1 font-medium text-slate-900">
                {sourceType === "csv" ? "CSV" : `${sheetNames.length}개`}
              </dd>
            </div>

            {sourceType === "csv" && textEncoding && (
              <div>
                <dt className="text-slate-500">문자 인코딩</dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {textEncoding === "utf-8" ? "UTF-8" : "CP949 / EUC-KR"}
                </dd>
              </div>
            )}

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
                  <dt className="text-slate-500">
                    {sourceType === "csv" ? "분석 대상" : "분석 시트"}
                  </dt>
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
                    <dt className="text-slate-500">자동 인식 확실도</dt>
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
    </section>
  );
}
