import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import * as XLSX from "xlsx";

import ForecastSection from "./ForecastSection";
import AnalysisReport from "./AnalysisReport";

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
} from "../services/recurringTransactionDetector";

import {
  createScenarioForecastAnalyses,
  getLatestBalance,
} from "../services/forecastEngine";
import type { ForecastScenario } from "../services/forecastScenario";
import { DEFAULT_FORECAST_SCENARIO } from "../services/forecastPresentation";

import type { ScheduledTransaction } from "../services/scheduledTransaction";
import { standardizeTransactionRows } from "../services/transactionRowStandardizer";
import {
  analyzeDataQuality,
  type DataQualitySummary as DataQualitySummaryValue,
} from "../services/dataQualityAnalyzer";
import {
  detectTransactionSheet,
  getWorksheetDetectionRows,
  type SheetDetectionResult,
  type TransactionSheetCandidate,
} from "../services/transactionSheetDetector";
import { createActionGuide } from "../services/actionGuide";
import { printAnalysisReport } from "../services/reportPresentation";

export function InvalidDateWarning({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <div
      className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"
      role="status"
    >
      <p className="font-semibold text-amber-900">
        날짜를 해석하지 못한 거래 {count}건
      </p>

      <p className="mt-1 text-sm leading-6 text-amber-800">
        금액이 정상인 거래는 전체 입출금과 전체 거래 건수에는
        포함되지만, 월별·반복거래·최근 잔액·Forecast 분석에서는
        제외했습니다. 따라서 전체 합계와 날짜 기반 합계가 다를 수
        있습니다.
      </p>
    </div>
  );
}

interface AmountWarningCounts {
  invalidAmountCount: number;
  unknownDirectionCount: number;
  directionConflictCount: number;
  directionOverrideCount: number;
  columnConflictCount: number;
}

function formatOriginalAmountValues(
  values: Transaction["originalAmountValues"],
): string {
  return [
    `입금 ${values.income ?? "없음"}`,
    `출금 ${values.expense ?? "없음"}`,
    `금액 ${values.amount ?? "없음"}`,
    `구분 ${values.direction ?? "없음"}`,
  ].join(", ");
}

function formatCurrency(value: number): string {
  const roundedValue = Math.round(value);
  const formattedValue = Math.abs(roundedValue).toLocaleString("ko-KR");

  return roundedValue < 0
    ? `-${formattedValue}원`
    : `${formattedValue}원`;
}

export function InvalidAmountWarning({
  invalidAmountCount,
  unknownDirectionCount,
  directionConflictCount,
  directionOverrideCount,
  columnConflictCount,
}: AmountWarningCounts) {
  const excludedCount =
    invalidAmountCount +
    unknownDirectionCount +
    directionConflictCount;

  if (
    excludedCount === 0 &&
    directionOverrideCount === 0 &&
    columnConflictCount === 0
  ) {
    return null;
  }

  return (
    <div
      className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"
      role="status"
    >
      {excludedCount > 0 && (
        <>
          <p className="font-semibold text-amber-900">
            금액 계산에서 제외된 거래 {excludedCount}건
          </p>

          <p className="mt-1 text-sm leading-6 text-amber-800">
            금액 오류 {invalidAmountCount}건, 방향 미확정{" "}
            {unknownDirectionCount}건, 방향 충돌{" "}
            {directionConflictCount}건입니다. 전체 거래 건수에는 포함되지만
            입출금 합계·평균·월별·카테고리·반복 거래 분석에서는 제외됩니다.
          </p>
        </>
      )}

      {columnConflictCount > 0 && (
        <p
          className={`${excludedCount > 0 ? "mt-2" : ""} text-sm leading-6 text-amber-800`}
        >
          분리 컬럼과 단일 금액이 다른 거래 {columnConflictCount}건은
          분리 입금·출금 컬럼 값을 우선 적용했습니다.
        </p>
      )}

      {directionOverrideCount > 0 && (
        <p
          className={`${excludedCount > 0 || columnConflictCount > 0 ? "mt-2" : ""} text-sm leading-6 text-amber-800`}
        >
          금액 부호와 입출금 구분이 다른 거래 {directionOverrideCount}건은
          명시된 입출금 구분을 우선 적용했습니다.
        </p>
      )}
    </div>
  );
}

export function TransactionDateValue({
  date,
}: Pick<Transaction, "date">) {
  if (date !== null) {
    return date;
  }

  return (
    <span className="font-medium text-amber-700">
      날짜 확인 필요
    </span>
  );
}

type TransactionAmountCellsProps = Pick<
  Transaction,
  "income" | "expense" | "amountStatus" | "originalAmountValues"
>;

export function TransactionAmountCells(
  item: TransactionAmountCellsProps,
) {
  if (item.income === null || item.expense === null) {
    return (
      <td
        className="px-4 py-3 text-right text-amber-700"
        colSpan={2}
      >
        <p className="font-medium">
          {item.amountStatus === "unknownDirection"
            ? "입출금 구분 확인 필요"
            : item.amountStatus === "directionConflict"
              ? "금액과 입출금 구분 확인 필요"
              : "금액 확인 필요"}
        </p>

        <p className="mt-1 text-xs text-amber-600">
          원본: {formatOriginalAmountValues(item.originalAmountValues)}
        </p>
      </td>
    );
  }

  return (
    <>
      <td className="px-4 py-3 text-right text-emerald-700">
        {item.income > 0 ? formatCurrency(item.income) : "-"}
      </td>

      <td className="px-4 py-3 text-right text-red-700">
        {item.expense > 0 ? formatCurrency(item.expense) : "-"}
      </td>
    </>
  );
}

export function DataQualitySummary({
  summary,
}: {
  summary: DataQualitySummaryValue;
}) {
  const hasWarning =
    summary.invalidAmountCount > 0 ||
    summary.invalidDateCount > 0 ||
    summary.directionIssueCount > 0;
  const metrics = [
    ["전체 거래", summary.totalTransactionCount],
    ["금액 계산 포함", summary.amountIncludedCount],
    ["날짜 기반 분석 포함", summary.dateAnalysisIncludedCount],
    ["금액 오류", summary.invalidAmountCount],
    ["날짜 오류", summary.invalidDateCount],
    ["방향 오류·충돌", summary.directionIssueCount],
  ] as const;

  return (
    <section
      className={`mt-6 rounded-xl border p-5 ${
        hasWarning
          ? "border-amber-200 bg-amber-50/60"
          : "border-slate-200 bg-slate-50"
      }`}
      aria-labelledby="data-quality-heading"
    >
      <div>
        <h3 id="data-quality-heading" className="font-semibold text-slate-900">
          데이터 품질
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          전체 금액 계산과 날짜 기반 분석에 포함된 거래 범위를 구분합니다.
        </p>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(([label, value]) => {
          const isErrorMetric =
            label === "금액 오류" ||
            label === "날짜 오류" ||
            label === "방향 오류·충돌";

          return (
            <div
              key={label}
              className="flex items-center justify-between rounded-lg border border-white/80 bg-white p-3"
            >
              <dt className="text-sm text-slate-600">{label}</dt>
              <dd
                className={`font-bold ${
                  isErrorMetric && value > 0
                    ? "text-amber-700"
                    : "text-slate-900"
                }`}
                data-quality={label}
              >
                {value.toLocaleString("ko-KR")}건
              </dd>
            </div>
          );
        })}
      </dl>

      {summary.validDateCount === 0 && summary.totalTransactionCount > 0 && (
        <p className="mt-4 text-sm font-medium leading-6 text-amber-800">
          유효한 거래일이 없어 최근 잔액과 Forecast를 계산할 수 없습니다.
        </p>
      )}
    </section>
  );
}

export function ReportPrintButton({
  visible,
  onPrint = printAnalysisReport,
}: {
  visible: boolean;
  onPrint?: () => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onPrint}
      className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
    >
      리포트 인쇄 / PDF 저장
    </button>
  );
}

export default function UploadArea() {
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetDetection, setSheetDetection] =
    useState<SheetDetectionResult | null>(null);
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

  const [scheduledTransactions, setScheduledTransactions] = useState<
    ScheduledTransaction[]
  >([]);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledDescription, setScheduledDescription] = useState("");
  const [scheduledType, setScheduledType] = useState<
    ScheduledTransaction["type"]
  >("expense");
  const [scheduledAmount, setScheduledAmount] = useState("");
  const [scheduledError, setScheduledError] = useState("");
  const [selectedScenario, setSelectedScenario] =
    useState<ForecastScenario>(DEFAULT_FORECAST_SCENARIO);

  const recurringTransactions = useMemo(
    () => detectRecurringTransactions(transactions),
    [transactions],
  );
  const latestBalance = useMemo(
    () => getLatestBalance(transactions),
    [transactions],
  );
  const dataQualitySummary = useMemo(
    () => analyzeDataQuality(transactions),
    [transactions],
  );
  const scenarioAnalyses = useMemo(
    () =>
      createScenarioForecastAnalyses(
        recurringTransactions,
        latestBalance,
        scheduledTransactions,
      ),
    [recurringTransactions, latestBalance, scheduledTransactions],
  );
  const selectedAnalysis = scenarioAnalyses[selectedScenario];
  const { forecasts } = selectedAnalysis;
  const actionGuideItems = useMemo(
    () =>
      createActionGuide({
        forecasts: selectedAnalysis.forecasts,
        cashRisk: selectedAnalysis.cashRisk,
        categorySummaries,
        monthlyCategorySummaries,
        scheduledTransactions,
      }),
    [
      selectedAnalysis,
      categorySummaries,
      monthlyCategorySummaries,
      scheduledTransactions,
    ],
  );

  const [invalidDateCount, setInvalidDateCount] = useState(0);

  const [amountWarningCounts, setAmountWarningCounts] =
    useState<AmountWarningCounts>({
      invalidAmountCount: 0,
      unknownDirectionCount: 0,
      directionConflictCount: 0,
      directionOverrideCount: 0,
      columnConflictCount: 0,
    });

  const [error, setError] = useState("");

  function resetFileInfo() {
    setFileName("");
    setFileSize("");
    setSheetNames([]);
    setSheetDetection(null);
    setColumnMappings([]);
    setTransactions([]);
    setSummary(null);
    setMonthlySummaries([]);
    setCategorySummaries([]);
    setMonthlyCategorySummaries([]);
    setInsights([]);
    setScheduledTransactions([]);
    setScheduledDate("");
    setScheduledDescription("");
    setScheduledType("expense");
    setScheduledAmount("");
    setScheduledError("");
    setSelectedScenario(DEFAULT_FORECAST_SCENARIO);
    setInvalidDateCount(0);
    setAmountWarningCounts({
      invalidAmountCount: 0,
      unknownDirectionCount: 0,
      directionConflictCount: 0,
      directionOverrideCount: 0,
      columnConflictCount: 0,
    });
  }

  function handleScheduledTransactionSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setScheduledError("");

    const description = scheduledDescription.trim();
    const amount = Number(scheduledAmount);
    const scheduledMonth = scheduledDate.slice(0, 7);
    const forecastMonths = forecasts.map((forecast) => forecast.month);

    if (!scheduledDate || !description || scheduledAmount.trim() === "") {
      setScheduledError("예정일, 내용, 금액을 모두 입력해주세요.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setScheduledError("금액은 0원보다 큰 숫자로 입력해주세요.");
      return;
    }

    if (!forecastMonths.includes(scheduledMonth)) {
      setScheduledError(
        `예정일은 Forecast 기간(${forecastMonths
          .map(formatMonth)
          .join(", ")}) 안에서 선택해주세요.`,
      );
      return;
    }

    const scheduledTransaction: ScheduledTransaction = {
      id: crypto.randomUUID(),
      date: scheduledDate,
      description,
      type: scheduledType,
      amount,
    };
    const nextScheduledTransactions = [
      ...scheduledTransactions,
      scheduledTransaction,
    ];

    setScheduledTransactions(nextScheduledTransactions);
    setScheduledDate("");
    setScheduledDescription("");
    setScheduledType("expense");
    setScheduledAmount("");
  }

  function handleScheduledTransactionRemove(id: string) {
    const nextScheduledTransactions = scheduledTransactions.filter(
      (transaction) => transaction.id !== id,
    );

    setScheduledTransactions(nextScheduledTransactions);
    setScheduledError("");
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
      const date1904 =
        workbook.Workbook?.WBProps?.date1904 === true;

      if (workbook.SheetNames.length === 0) {
        throw new Error("엑셀 시트를 찾을 수 없습니다.");
      }

      const sheetCandidates: TransactionSheetCandidate[] =
        workbook.SheetNames.map((sheetName, sheetIndex) => ({
          sheetName,
          sheetIndex,
          rows: getWorksheetDetectionRows(workbook.Sheets[sheetName]),
        }));
      const detectedSheet = detectTransactionSheet(sheetCandidates, {
        date1904,
      });

      if (!detectedSheet) {
        setError(
          "거래내역으로 판단할 수 있는 시트를 찾지 못했습니다.",
        );
        event.target.value = "";
        return;
      }

      const selectedSheet = workbook.Sheets[detectedSheet.sheetName];
      const detectionRows = sheetCandidates[detectedSheet.sheetIndex]?.rows;

      if (!selectedSheet || !detectionRows) {
        throw new Error("자동 선택된 거래 시트를 읽을 수 없습니다.");
      }

      const headerRow = detectionRows[detectedSheet.headerRowIndex] ?? [];

      const columnNames = headerRow
        .map((cell) => String(cell).trim())
        .filter((cell) => cell !== "");

      if (columnNames.length === 0) {
        setError("자동 선택된 거래 시트의 컬럼명을 찾지 못했습니다.");
        event.target.value = "";
        return;
      }

      const objectRows =
        XLSX.utils.sheet_to_json<Record<string, unknown>>(selectedSheet, {
          defval: "",
          range: detectedSheet.headerRowIndex,
        });

      const mappings = mapColumns(columnNames, objectRows);

      const standardizedRows = standardizeTransactionRows(
        objectRows,
        mappings,
      );

      const parsedResult = parseTransactions(standardizedRows, {
        date1904,
      });

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
      setSheetDetection(detectedSheet);
      setColumnMappings(mappings);
      setTransactions(parsedResult.transactions);
      setSummary(financialSummary);
      setMonthlySummaries(monthlyResults);
      setCategorySummaries(categoryResults);
      setMonthlyCategorySummaries(monthlyCategoryResults);
      setInsights(generatedInsights);
      setInvalidDateCount(parsedResult.invalidDateCount);
      setAmountWarningCounts({
        invalidAmountCount: parsedResult.invalidAmountCount,
        unknownDirectionCount: parsedResult.unknownDirectionCount,
        directionConflictCount: parsedResult.directionConflictCount,
        directionOverrideCount: parsedResult.directionOverrideCount,
        columnConflictCount: parsedResult.columnConflictCount,
      });
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
    <>
      <section className="screen-only rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
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

            {sheetDetection && (
              <>
                <div>
                  <dt className="text-slate-500">분석 시트</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {sheetDetection.sheetName}
                  </dd>
                </div>

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
              </>
            )}
          </dl>

          {sheetDetection && (
            <p className="mt-4 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600">
              {sheetDetection.reasons.join(" · ")}
            </p>
          )}
        </div>
      )}

      {summary && sheetDetection && (
        <div className="mt-5 flex justify-end">
          <ReportPrintButton visible />
        </div>
      )}

      {summary && (
        <div className="mt-6">
          <h3 className="mb-3 font-semibold text-slate-900">
            재무 요약
          </h3>

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

          {latestBalance !== null && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                최근 거래 기준 잔액
              </p>

              <p
                className={`mt-1 text-lg font-bold ${
                  latestBalance >= 0
                    ? "text-slate-900"
                    : "text-red-700"
                }`}
              >
                {formatCurrency(latestBalance)}
              </p>
            </div>
          )}
        </div>
      )}

      {transactions.length > 0 && (
        <DataQualitySummary summary={dataQualitySummary} />
      )}

      <InvalidDateWarning count={invalidDateCount} />

      <InvalidAmountWarning {...amountWarningCounts} />

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
                  <th className="px-4 py-3 text-right">
                    거래 건수
                  </th>
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

                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        item.netCashFlow >= 0
                          ? "text-blue-700"
                          : "text-red-700"
                      }`}
                    >
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
          <h3 className="mb-3 font-semibold text-slate-900">
            반복 거래 분석
          </h3>

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
                    <td className="px-4 py-3 font-medium">
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
                      {item.confidence === "high" ? "높음" : "보통"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {forecasts.length > 0 && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              확정 예정 거래
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              향후 3개월 안에 확정된 입금이나 출금을 추가하면 Forecast와
              현금 위험도가 바로 다시 계산됩니다.
            </p>
          </div>

          <form
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            onSubmit={handleScheduledTransactionSubmit}
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <label className="text-sm font-medium text-slate-700">
                예정일
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
              </label>

              <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                내용
                <input
                  type="text"
                  value={scheduledDescription}
                  onChange={(event) =>
                    setScheduledDescription(event.target.value)
                  }
                  placeholder="예: 거래처 대금 입금"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                입금/출금
                <select
                  value={scheduledType}
                  onChange={(event) =>
                    setScheduledType(
                      event.target.value as ScheduledTransaction["type"],
                    )
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  <option value="income">입금</option>
                  <option value="expense">출금</option>
                </select>
              </label>

              <label className="text-sm font-medium text-slate-700">
                금액
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={scheduledAmount}
                  onChange={(event) => setScheduledAmount(event.target.value)}
                  placeholder="0"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-right text-slate-900"
                />
              </label>
            </div>

            {scheduledError && (
              <p className="mt-3 text-sm font-medium text-red-700" role="alert">
                {scheduledError}
              </p>
            )}

            <button
              type="submit"
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              추가
            </button>
          </form>

          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            {scheduledTransactions.length === 0 ? (
              <p className="bg-white px-4 py-5 text-sm text-slate-500">
                추가된 확정 예정 거래가 없습니다.
              </p>
            ) : (
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">예정일</th>
                    <th className="px-4 py-3 font-medium">내용</th>
                    <th className="px-4 py-3 font-medium">유형</th>
                    <th className="px-4 py-3 text-right font-medium">금액</th>
                    <th className="px-4 py-3 text-right font-medium">관리</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 bg-white">
                  {[...scheduledTransactions]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="px-4 py-3">{transaction.date}</td>
                        <td className="px-4 py-3 font-medium">
                          {transaction.description}
                        </td>
                        <td className="px-4 py-3">
                          {transaction.type === "income" ? "입금" : "출금"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold ${
                            transaction.type === "income"
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {formatCurrency(transaction.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              handleScheduledTransactionRemove(transaction.id)
                            }
                            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <ForecastSection
        analysis={selectedAnalysis}
        selectedScenario={selectedScenario}
        onScenarioChange={setSelectedScenario}
        actionGuideItems={actionGuideItems}
      />

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
                  <th className="px-4 py-3 text-right">
                    지출 비중
                  </th>
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
                    <td className="px-4 py-3">
                      <TransactionDateValue date={item.date} />
                    </td>

                    <td className="px-4 py-3">
                      {item.description}

                      {item.amountStatus === "columnConflict" && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          단일 금액과 불일치 — 분리 컬럼 적용
                        </p>
                      )}

                      {item.amountStatus === "directionOverride" && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          금액 부호와 불일치 — 입출금 구분 적용
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {item.categoryName}
                    </td>

                    <TransactionAmountCells {...item} />
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
                  <th className="px-4 py-3 text-left">
                    원본 컬럼
                  </th>

                  <th className="px-4 py-3 text-left">
                    인식 결과
                  </th>

                  <th className="px-4 py-3 text-left">
                    신뢰도
                  </th>
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

      {summary && sheetDetection && (
        <AnalysisReport
          fileName={fileName}
          sheetName={sheetDetection.sheetName}
          generatedAt={new Date()}
          summary={summary}
          latestBalance={latestBalance}
          dataQuality={dataQualitySummary}
          monthlySummaries={monthlySummaries}
          analysis={selectedAnalysis}
          selectedScenario={selectedScenario}
          actionGuideItems={actionGuideItems}
          categorySummaries={categorySummaries}
        />
      )}
    </>
  );
}
