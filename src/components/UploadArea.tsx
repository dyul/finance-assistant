import { useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";

import {
  mapColumns,
  type ColumnMapping,
} from "../services/columnMapper";

import {
  calculateFinancialSummary,
  type FinancialSummary,
} from "../services/financialEngine";

import { parseTransactions } from "../services/transactionParser";

export default function UploadArea() {
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [error, setError] = useState("");

  function resetFileInfo() {
    setFileName("");
    setFileSize("");
    setSheetNames([]);
    setColumnMappings([]);
    setSummary(null);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setSummary(null);

    const allowedExtensions = [".xlsx", ".xls"];
    const extension = file.name
      .slice(file.name.lastIndexOf("."))
      .toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      setError("엑셀 파일(.xlsx 또는 .xls)만 업로드할 수 있습니다.");
      resetFileInfo();
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];

      if (!firstSheet) {
        throw new Error("엑셀 시트를 찾을 수 없습니다.");
      }

      // 첫 번째 시트를 행 배열 형태로 읽어 헤더를 찾습니다.
      const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
        header: 1,
        defval: "",
      });

      const headerRow = rows.find((row) =>
        row.some((cell) => String(cell).trim() !== ""),
      );

      const columnNames = headerRow
        ? headerRow
            .map((cell) => String(cell).trim())
            .filter((cell) => cell !== "")
        : [];

      if (columnNames.length === 0) {
        setError("첫 번째 시트에서 컬럼명을 찾지 못했습니다.");
        resetFileInfo();
        return;
      }

      // 원본 컬럼을 Finance Assistant 표준 컬럼으로 매핑합니다.
      const mappings = mapColumns(columnNames);

      // 엑셀 데이터를 객체 배열 형태로 읽습니다.
      const objectRows =
        XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: "",
        });

      // 원본 컬럼명을 표준 컬럼명으로 변환합니다.
      const standardizedRows = objectRows.map((row) => {
        const standardizedRow: Record<string, unknown> = {};

        for (const mapping of mappings) {
          if (mapping.standardName !== "unknown") {
            standardizedRow[mapping.standardName] =
              row[mapping.originalName];
          }
        }

        return standardizedRow;
      });

      // 표준 거래내역으로 변환합니다.
      const parsedResult = parseTransactions(standardizedRows);

      // 재무 KPI를 계산합니다.
      const financialSummary = calculateFinancialSummary(
        parsedResult.transactions,
      );

      setFileName(file.name);
      setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
      setSheetNames(workbook.SheetNames);
      setColumnMappings(mappings);
      setSummary(financialSummary);
    } catch (caughtError) {
      console.error(caughtError);
      setError("파일을 읽는 중 오류가 발생했습니다.");
      resetFileInfo();
    }
  }

  function getConfidenceLabel(
    confidence: ColumnMapping["confidence"],
  ) {
    if (confidence === "high") {
      return "높음";
    }

    if (confidence === "medium") {
      return "보통";
    }

    return "낮음";
  }

  function getConfidenceStyle(
    confidence: ColumnMapping["confidence"],
  ) {
    if (confidence === "high") {
      return "bg-emerald-50 text-emerald-700";
    }

    if (confidence === "medium") {
      return "bg-amber-50 text-amber-700";
    }

    return "bg-red-50 text-red-700";
  }

  function formatCurrency(value: number) {
    return `${Math.round(value).toLocaleString("ko-KR")}원`;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">
          엑셀 업로드
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          평소 사용하던 재무 엑셀을 그대로 올려주세요.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center transition hover:border-blue-400 hover:bg-blue-50">
        <span className="font-medium text-slate-700">
          엑셀 파일 선택
        </span>

        <span className="mt-1 text-sm text-slate-500">
          .xlsx 또는 .xls 파일
        </span>

        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {fileName && (
        <div className="mt-5 rounded-lg bg-slate-50 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
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
          </dl>

          <div className="mt-4">
            <p className="text-sm text-slate-500">시트 목록</p>

            <div className="mt-2 flex flex-wrap gap-2">
              {sheetNames.map((sheetName) => (
                <span
                  key={sheetName}
                  className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                >
                  {sheetName}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              재무 요약
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              업로드한 거래내역을 기준으로 계산한 결과입니다.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">총 입금</p>
              <p className="mt-2 text-xl font-bold text-emerald-700">
                {formatCurrency(summary.totalIncome)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">총 출금</p>
              <p className="mt-2 text-xl font-bold text-red-700">
                {formatCurrency(summary.totalExpense)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">순현금흐름</p>
              <p
                className={`mt-2 text-xl font-bold ${
                  summary.netCashFlow >= 0
                    ? "text-blue-700"
                    : "text-red-700"
                }`}
              >
                {summary.netCashFlow >= 0 ? "+" : ""}
                {formatCurrency(summary.netCashFlow)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">거래 건수</p>
              <p className="mt-2 text-xl font-bold text-slate-900">
                {summary.transactionCount.toLocaleString("ko-KR")}건
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                평균 거래금액
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency(summary.averageTransactionAmount)}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">최대 입금</p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency(summary.largestIncome)}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">최대 출금</p>
              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency(summary.largestExpense)}
              </p>
            </div>
          </div>
        </div>
      )}

      {columnMappings.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              컬럼 자동 인식 결과
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              첫 번째 시트의 컬럼을 Finance Assistant 표준 항목으로
              변환했습니다.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    원본 컬럼
                  </th>
                  <th className="px-4 py-3 font-medium">
                    인식 결과
                  </th>
                  <th className="px-4 py-3 font-medium">신뢰도</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {columnMappings.map((mapping, index) => (
                  <tr key={`${mapping.originalName}-${index}`}>
                    <td className="px-4 py-3 text-slate-700">
                      {mapping.originalName}
                    </td>

                    <td className="px-4 py-3 font-medium text-slate-900">
                      {mapping.displayName}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${getConfidenceStyle(
                          mapping.confidence,
                        )}`}
                      >
                        {getConfidenceLabel(mapping.confidence)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}