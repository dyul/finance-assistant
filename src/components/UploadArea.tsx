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

import {
  parseTransactions,
  type Transaction,
} from "../services/transactionParser";

import {
  aggregateMonthly,
  type MonthlySummary,
} from "../services/monthlyAggregator";

import {
  aggregateExpensesByCategory,
  type CategorySummary,
} from "../services/categoryAggregator";

import {
  aggregateMonthlyExpensesByCategory,
  type MonthlyCategorySummary,
} from "../services/monthlyCategoryAggregator";

import {
  generateFinancialInsights,
  type FinancialInsight,
} from "../services/insightEngine";

export default function UploadArea() {
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [categorySummaries, setCategorySummaries] = useState<CategorySummary[]>(
    [],
  );
  const [monthlyCategorySummaries, setMonthlyCategorySummaries] = useState<
    MonthlyCategorySummary[]
  >([]);
  const [insights, setInsights] = useState<FinancialInsight[]>([]);
  const [error, setError] = useState("");

  function resetFileInfo() {
    setFileName("");
    setFileSize("");
    setSheetNames([]);
    setColumnMappings([]);
    setTransactions([]);
    setSummary(null);
    setMonthlySummaries([]);
    setCategorySummaries([]);
    setMonthlyCategorySummaries([]);
    setInsights([]);
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    resetFileInfo();

    const allowedExtensions = [".xlsx", ".xls"];
    const dotIndex = file.name.lastIndexOf(".");
    const extension =
      dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : "";

    if (!allowedExtensions.includes(extension)) {
      setError("엑셀 파일(.xlsx 또는 .xls)만 업로드할 수 있습니다.");
      event.target.value = "";
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];

      if (!firstSheetName || !firstSheet) {
        throw new Error("엑셀 시트를 찾을 수 없습니다.");
      }

      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
        header: 1,
        defval: "",
      });

      const headerRowIndex = rawRows.findIndex((row) =>
        row.some((cell) => String(cell).trim() !== ""),
      );

      if (headerRowIndex < 0) {
        setError("첫 번째 시트에서 컬럼명을 찾지 못했습니다.");
        event.target.value = "";
        return;
      }

      const headerRow = rawRows[headerRowIndex];

      const columnNames = headerRow
        .map((cell) => String(cell).trim())
        .filter((cell) => cell !== "");

      if (columnNames.length === 0) {
        setError("첫 번째 시트에서 컬럼명을 찾지 못했습니다.");
        event.target.value = "";
        return;
      }

      const mappings = mapColumns(columnNames);

      const objectRows =
        XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: "",
          range: headerRowIndex,
        });

      const standardizedRows = objectRows.map((row) => {
        const standardizedRow: Record<string, unknown> = {};

        for (const mapping of mappings) {
          if (mapping.standardName === "unknown") {
            continue;
          }

          standardizedRow[mapping.standardName] =
            row[mapping.originalName];
        }

        return standardizedRow;
      });

      const parsedResult = parseTransactions(standardizedRows);

      const financialSummary = calculateFinancialSummary(
        parsedResult.transactions,
      );

      const monthlyResults = aggregateMonthly(
        parsedResult.transactions,
      );

      const categoryResults = aggregateExpensesByCategory(
        parsedResult.transactions,
      );

      const monthlyCategoryResults =
        aggregateMonthlyExpensesByCategory(
          parsedResult.transactions,
        );

      const generatedInsights = generateFinancialInsights(
        monthlyResults,
        categoryResults,
        monthlyCategoryResults,
      );

      setFileName(file.name);
      setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
      setSheetNames(workbook.SheetNames);
      setColumnMappings(mappings);
      setTransactions(parsedResult.transactions);
      setSummary(financialSummary);
      setMonthlySummaries(monthlyResults);
      setCategorySummaries(categoryResults);
      setMonthlyCategorySummaries(monthlyCategoryResults);
      setInsights(generatedInsights);
    } catch (caughtError) {
      console.error(caughtError);
      resetFileInfo();
      setError("파일을 읽는 중 오류가 발생했습니다.");
    } finally {
      event.target.value = "";
    }
  }

  function getConfidenceLabel(
    confidence: ColumnMapping["confidence"],
  ): string {
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
  ): string {
    if (confidence === "high") {
      return "bg-emerald-50 text-emerald-700";
    }

    if (confidence === "medium") {
      return "bg-amber-50 text-amber-700";
    }

    return "bg-red-50 text-red-700";
  }

  function formatCurrency(value: number): string {
    const roundedValue = Math.round(value);
    const formattedValue = Math.abs(roundedValue).toLocaleString("ko-KR");

    return roundedValue < 0
      ? `-${formattedValue}원`
      : `${formattedValue}원`;
  }

  function formatSignedCurrency(value: number): string {
    if (value > 0) {
      return `+${formatCurrency(value)}`;
    }

    return formatCurrency(value);
  }

  function formatMonth(month: string): string {
    const [year, monthNumber] = month.split("-");

    if (!year || !monthNumber) {
      return month;
    }

    return `${year}년 ${Number(monthNumber)}월`;
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
                {formatSignedCurrency(summary.netCashFlow)}
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
              <p className="text-sm text-slate-500">
                최대 입금
              </p>

              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency(summary.largestIncome)}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                최대 출금
              </p>

              <p className="mt-1 font-semibold text-slate-900">
                {formatCurrency(summary.largestExpense)}
              </p>
            </div>
          </div>
        </div>
      )}

      {monthlySummaries.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              월별 현금흐름
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              거래일을 기준으로 월별 입금과 출금을 집계했습니다.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">기준월</th>
                  <th className="px-4 py-3 text-right font-medium">
                    총 입금
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    총 출금
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    순현금흐름
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    거래 건수
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {monthlySummaries.map((monthlySummary) => (
                  <tr key={monthlySummary.month}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatMonth(monthlySummary.month)}
                    </td>

                    <td className="px-4 py-3 text-right text-emerald-700">
                      {formatCurrency(monthlySummary.income)}
                    </td>

                    <td className="px-4 py-3 text-right text-red-700">
                      {formatCurrency(monthlySummary.expense)}
                    </td>

                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        monthlySummary.netCashFlow >= 0
                          ? "text-blue-700"
                          : "text-red-700"
                      }`}
                    >
                      {formatSignedCurrency(
                        monthlySummary.netCashFlow,
                      )}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {monthlySummary.transactionCount.toLocaleString(
                        "ko-KR",
                      )}
                      건
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {categorySummaries.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              카테고리별 지출 분석
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              전체 출금액을 자동 분류된 카테고리별로 분석했습니다.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">카테고리</th>
                  <th className="px-4 py-3 text-right font-medium">
                    지출액
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    지출 비중
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    거래 건수
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {categorySummaries.map((categorySummary) => (
                  <tr key={categorySummary.category}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {categorySummary.categoryName}
                    </td>

                    <td className="px-4 py-3 text-right text-red-700">
                      {formatCurrency(categorySummary.amount)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {categorySummary.shareOfExpense.toFixed(1)}%
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {categorySummary.transactionCount.toLocaleString(
                        "ko-KR",
                      )}
                      건
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {monthlyCategorySummaries.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              월별 주요 지출
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              각 월의 지출을 카테고리별로 분석했습니다.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">기준월</th>
                  <th className="px-4 py-3 font-medium">
                    카테고리
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    지출액
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    월 지출 비중
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    거래 건수
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {monthlyCategorySummaries.map((item) => (
                  <tr key={`${item.month}-${item.category}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatMonth(item.month)}
                    </td>

                    <td className="px-4 py-3 text-slate-900">
                      {item.categoryName}
                    </td>

                    <td className="px-4 py-3 text-right text-red-700">
                      {formatCurrency(item.amount)}
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {item.shareOfMonthlyExpense.toFixed(1)}%
                    </td>

                    <td className="px-4 py-3 text-right text-slate-700">
                      {item.transactionCount.toLocaleString("ko-KR")}건
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              재무 인사이트
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              최근 현금흐름과 월별 지출 구조를 기준으로 자동 생성한
              분석입니다.
            </p>
          </div>

          <div className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={`${insight.title}-${index}`}
                className={`rounded-lg border p-4 ${
                  insight.level === "positive"
                    ? "border-emerald-200 bg-emerald-50"
                    : insight.level === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="font-medium text-slate-900">
                  {insight.title}
                </p>

                <p className="mt-1 text-sm text-slate-700">
                  {insight.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              거래 자동 분류 결과
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              거래 적요를 기준으로 카테고리를 자동 분류했습니다.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">거래일</th>
                  <th className="px-4 py-3 font-medium">적요</th>
                  <th className="px-4 py-3 font-medium">분류</th>
                  <th className="px-4 py-3 text-right font-medium">
                    입금
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    출금
                  </th>
                  <th className="px-4 py-3 font-medium">신뢰도</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {transactions.map((transaction, index) => (
                  <tr
                    key={`${transaction.date}-${transaction.description}-${index}`}
                  >
                    <td className="px-4 py-3 text-slate-700">
                      {transaction.date}
                    </td>

                    <td className="px-4 py-3 text-slate-900">
                      {transaction.description}
                    </td>

                    <td className="px-4 py-3 font-medium text-slate-900">
                      {transaction.categoryName}
                    </td>

                    <td className="px-4 py-3 text-right text-emerald-700">
                      {transaction.income > 0
                        ? formatCurrency(transaction.income)
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-red-700">
                      {transaction.expense > 0
                        ? formatCurrency(transaction.expense)
                        : "-"}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          transaction.confidence === "high"
                            ? "bg-emerald-50 text-emerald-700"
                            : transaction.confidence === "medium"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {transaction.confidence === "high"
                          ? "높음"
                          : transaction.confidence === "medium"
                            ? "보통"
                            : "낮음"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <th className="px-4 py-3 font-medium">
                    신뢰도
                  </th>
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