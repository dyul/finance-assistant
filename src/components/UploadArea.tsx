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

import {
  detectRecurringTransactions,
  type RecurringTransaction,
} from "../services/recurringTransactionDetector";

export default function UploadArea() {
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);

  const [monthlySummaries, setMonthlySummaries] = useState<
    MonthlySummary[]
  >([]);

  const [categorySummaries, setCategorySummaries] = useState<
    CategorySummary[]
  >([]);

  const [monthlyCategorySummaries, setMonthlyCategorySummaries] =
    useState<MonthlyCategorySummary[]>([]);

  const [insights, setInsights] = useState<FinancialInsight[]>([]);

  const [recurringTransactions, setRecurringTransactions] = useState<
    RecurringTransaction[]
  >([]);

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
    setRecurringTransactions([]);
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

      const recurringResults = detectRecurringTransactions(
        parsedResult.transactions,
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
      setRecurringTransactions(recurringResults);
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
        </div>
      )}

      {summary && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              재무 요약
            </h3>
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
        </div>
      )}

      {monthlySummaries.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-semibold text-slate-900">
            월별 현금흐름
          </h3>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">기준월</th>
                  <th className="px-4 py-3 text-right">총 입금</th>
                  <th className="px-4 py-3 text-right">총 출금</th>
                  <th className="px-4 py-3 text-right">
                    순현금흐름
                  </th>
                  <th className="px-4 py-3 text-right">거래 건수</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {monthlySummaries.map((item) => (
                  <tr key={item.month}>
                    <td className="px-4 py-3 font-medium">
                      {formatMonth(item.month)}
                    </td>

                    <td className="px-4 py-3 text-right text-emerald-700">
                      {formatCurrency(item.income)}
                    </td>

                    <td className="px-4 py-3 text-right text-red-700">
                      {formatCurrency(item.expense)}
                    </td>

                    <td className="px-4 py-3 text-right font-semibold text-blue-700">
                      {formatSignedCurrency(item.netCashFlow)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {item.transactionCount}건
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recurringTransactions.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              반복 거래 분석
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              여러 달에 반복된 거래를 탐지해 향후 현금흐름 예측 후보로
              분류했습니다.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">거래내용</th>
                  <th className="px-4 py-3 font-medium">유형</th>
                  <th className="px-4 py-3 font-medium">분류</th>
                  <th className="px-4 py-3 text-right font-medium">
                    평균금액
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    발생월
                  </th>
                  <th className="px-4 py-3 font-medium">기간</th>
                  <th className="px-4 py-3 font-medium">신뢰도</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 bg-white">
                {recurringTransactions.map((item, index) => (
                  <tr
                    key={`${item.description}-${item.type}-${index}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.description}
                    </td>

                    <td className="px-4 py-3">
                      {item.type === "income" ? "수입" : "지출"}
                    </td>

                    <td className="px-4 py-3">
                      {item.categoryName}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {formatCurrency(item.averageAmount)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {item.activeMonthCount}개월
                    </td>

                    <td className="px-4 py-3">
                      {formatMonth(item.firstMonth)} ~{" "}
                      {formatMonth(item.lastMonth)}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.confidence === "high"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {item.confidence === "high"
                          ? "높음"
                          : "보통"}
                      </span>
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
          <h3 className="mb-3 font-semibold text-slate-900">
            카테고리별 지출 분석
          </h3>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">카테고리</th>
                  <th className="px-4 py-3 text-right">지출액</th>
                  <th className="px-4 py-3 text-right">지출 비중</th>
                </tr>
              </thead>

              <tbody>
                {categorySummaries.map((item) => (
                  <tr
                    key={item.category}
                    className="border-t border-slate-200"
                  >
                    <td className="px-4 py-3 font-medium">
                      {item.categoryName}
                    </td>

                    <td className="px-4 py-3 text-right text-red-700">
                      {formatCurrency(item.amount)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {item.shareOfExpense.toFixed(1)}%
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
          <h3 className="mb-3 font-semibold text-slate-900">
            월별 주요 지출
          </h3>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">기준월</th>
                  <th className="px-4 py-3 text-left">카테고리</th>
                  <th className="px-4 py-3 text-right">지출액</th>
                  <th className="px-4 py-3 text-right">
                    월 지출 비중
                  </th>
                </tr>
              </thead>

              <tbody>
                {monthlyCategorySummaries.map((item) => (
                  <tr
                    key={`${item.month}-${item.category}`}
                    className="border-t border-slate-200"
                  >
                    <td className="px-4 py-3 font-medium">
                      {formatMonth(item.month)}
                    </td>

                    <td className="px-4 py-3">
                      {item.categoryName}
                    </td>

                    <td className="px-4 py-3 text-right text-red-700">
                      {formatCurrency(item.amount)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {item.shareOfMonthlyExpense.toFixed(1)}%
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
          <h3 className="mb-3 font-semibold text-slate-900">
            재무 인사이트
          </h3>

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
          <h3 className="mb-3 font-semibold text-slate-900">
            거래 자동 분류 결과
          </h3>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[750px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">거래일</th>
                  <th className="px-4 py-3 text-left">적요</th>
                  <th className="px-4 py-3 text-left">분류</th>
                  <th className="px-4 py-3 text-right">입금</th>
                  <th className="px-4 py-3 text-right">출금</th>
                </tr>
              </thead>

              <tbody>
                {transactions.map((item, index) => (
                  <tr
                    key={`${item.date}-${item.description}-${index}`}
                    className="border-t border-slate-200"
                  >
                    <td className="px-4 py-3">{item.date}</td>
                    <td className="px-4 py-3">
                      {item.description}
                    </td>
                    <td className="px-4 py-3">
                      {item.categoryName}
                    </td>

                    <td className="px-4 py-3 text-right text-emerald-700">
                      {item.income > 0
                        ? formatCurrency(item.income)
                        : "-"}
                    </td>

                    <td className="px-4 py-3 text-right text-red-700">
                      {item.expense > 0
                        ? formatCurrency(item.expense)
                        : "-"}
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
          <h3 className="mb-3 font-semibold text-slate-900">
            컬럼 자동 인식 결과
          </h3>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left">원본 컬럼</th>
                  <th className="px-4 py-3 text-left">인식 결과</th>
                  <th className="px-4 py-3 text-left">신뢰도</th>
                </tr>
              </thead>

              <tbody>
                {columnMappings.map((mapping, index) => (
                  <tr
                    key={`${mapping.originalName}-${index}`}
                    className="border-t border-slate-200"
                  >
                    <td className="px-4 py-3">
                      {mapping.originalName}
                    </td>

                    <td className="px-4 py-3 font-medium">
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