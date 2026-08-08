import {
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import ForecastSection from "./ForecastSection";
import AnalysisReport from "./AnalysisReport";
import ManualMappingPanel from "./ManualMappingPanel";
import FileUploadSection from "./FileUploadSection";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  type AnalysisMode,
} from "./fileUploadPresentation";
import ScheduledTransactionSection from "./ScheduledTransactionSection";
import OnboardingSection from "./OnboardingSection";
import DashboardOverview from "./DashboardOverview";
import AnalysisIssuePanel from "./AnalysisIssuePanel";

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
import {
  createForecastSummary,
  DEFAULT_FORECAST_SCENARIO,
} from "../services/forecastPresentation";

import {
  partitionScheduledTransactionsByForecastMonths,
  type ScheduledTransaction,
} from "../services/scheduledTransaction";
import { standardizeTransactionRows } from "../services/transactionRowStandardizer";
import {
  analyzeDataQuality,
  type DataQualitySummary as DataQualitySummaryValue,
} from "../services/dataQualityAnalyzer";
import {
  detectTransactionSheet,
  type SheetDetectionResult,
} from "../services/transactionSheetDetector";
import { createActionGuide } from "../services/actionGuide";
import { printAnalysisReport } from "../services/reportPresentation";
import {
  clearUserSession,
  loadUserFileSession,
  saveUserFileSession,
} from "../services/userSessionStorage";
import {
  countValidManualTransactions,
  convertManualMappingToColumnMappings,
  createManualMappingPrefill,
  validateManualMapping,
  type ManualTransactionMapping,
} from "../services/manualMapping";
import { loadExcelWorkbook } from "../services/excelWorkbookLoader";
import type { ExcelWorkbook } from "../services/excelWorkbook";
import {
  createAnalysisLimitationIssues,
  createBlockingAnalysisIssue,
  createPartialAnalysisIssues,
  type AnalysisIssue,
} from "../services/analysisIssuePresentation";
import {
  formatCurrency,
  formatMonth,
  formatSignedCurrency,
} from "../utils/formatters";

interface AmountWarningCounts {
  invalidAmountCount: number;
  unknownDirectionCount: number;
  directionConflictCount: number;
  directionOverrideCount: number;
  columnConflictCount: number;
}

class NoValidTransactionsError extends Error {
  constructor() {
    super("선택한 설정에서 유효한 거래를 찾지 못했습니다.");
    this.name = "NoValidTransactionsError";
  }
}

function getManualAmountStructure(
  amountMode: ManualTransactionMapping["amountMode"],
): SheetDetectionResult["amountStructure"] {
  if (amountMode === "split") {
    return "separate";
  }

  if (amountMode === "amount-direction") {
    return "amountDirection";
  }

  return "signedAmount";
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
    ["금액 확인 필요", summary.invalidAmountCount],
    ["날짜 확인 필요", summary.invalidDateCount],
    ["입출금 구분 확인 필요", summary.directionIssueCount],
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
          분석에 사용된 거래 확인
        </h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          전체 거래 중 금액·날짜 분석에 포함된 건수와 다시 확인할 건수를
          보여줍니다.
        </p>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(([label, value]) => {
          const isErrorMetric =
            label === "금액 확인 필요" ||
            label === "날짜 확인 필요" ||
            label === "입출금 구분 확인 필요";

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
  const [workbook, setWorkbook] = useState<ExcelWorkbook | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");
  const sheetNames = workbook?.sheetNames ?? [];
  const [sheetDetection, setSheetDetection] =
    useState<SheetDetectionResult | null>(null);
  const [automaticSheetDetection, setAutomaticSheetDetection] =
    useState<SheetDetectionResult | null>(null);
  const [analysisMode, setAnalysisMode] =
    useState<AnalysisMode | null>(null);
  const [manualMapping, setManualMapping] =
    useState<ManualTransactionMapping | null>(null);
  const [manualMappingOpen, setManualMappingOpen] = useState(false);
  const [manualMappingErrors, setManualMappingErrors] = useState<string[]>([]);
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
  const [selectedScenario, setSelectedScenario] =
    useState<ForecastScenario>(DEFAULT_FORECAST_SCENARIO);
  const [sessionStorageAvailable, setSessionStorageAvailable] =
    useState(true);
  const manualMappingSheetName = manualMapping?.sheetName;
  const manualMappingHeaderRowIndex = manualMapping?.headerRowIndex;
  const manualWorksheetPreview = useMemo(
    () =>
      workbook &&
      manualMappingSheetName !== undefined &&
      manualMappingHeaderRowIndex !== undefined
        ? workbook.getPreview(
            manualMappingSheetName,
            manualMappingHeaderRowIndex,
          )
        : { columns: [], rows: [], headerRowLimit: 0 },
    [
      workbook,
      manualMappingSheetName,
      manualMappingHeaderRowIndex,
    ],
  );

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
  const forecastMonths = useMemo(
    () =>
      createScenarioForecastAnalyses(
        recurringTransactions,
        latestBalance,
      ).base.forecasts.map((forecast) => forecast.month),
    [recurringTransactions, latestBalance],
  );
  const scheduledTransactionForecastScope = useMemo(
    () =>
      partitionScheduledTransactionsByForecastMonths(
        scheduledTransactions,
        forecastMonths,
      ),
    [forecastMonths, scheduledTransactions],
  );
  const applicableScheduledTransactions =
    scheduledTransactionForecastScope.applicable;
  const outOfPeriodScheduledTransactions =
    scheduledTransactionForecastScope.outOfPeriod;
  const scenarioAnalyses = useMemo(
    () =>
      createScenarioForecastAnalyses(
        recurringTransactions,
        latestBalance,
        applicableScheduledTransactions,
      ),
    [
      recurringTransactions,
      latestBalance,
      applicableScheduledTransactions,
    ],
  );
  const selectedAnalysis = scenarioAnalyses[selectedScenario];
  const { forecasts } = selectedAnalysis;
  const selectedForecastSummary = useMemo(
    () =>
      createForecastSummary(
        selectedAnalysis.forecasts,
        selectedAnalysis.cashRisk,
      ),
    [selectedAnalysis],
  );
  const actionGuideItems = useMemo(
    () =>
      createActionGuide({
        forecasts: selectedAnalysis.forecasts,
        cashRisk: selectedAnalysis.cashRisk,
        categorySummaries,
        monthlyCategorySummaries,
        scheduledTransactions: applicableScheduledTransactions,
      }),
    [
      selectedAnalysis,
      categorySummaries,
      monthlyCategorySummaries,
      applicableScheduledTransactions,
    ],
  );

  const [amountWarningCounts, setAmountWarningCounts] =
    useState<AmountWarningCounts>({
      invalidAmountCount: 0,
      unknownDirectionCount: 0,
      directionConflictCount: 0,
      directionOverrideCount: 0,
      columnConflictCount: 0,
    });

  const [blockingIssue, setBlockingIssue] =
    useState<AnalysisIssue | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const partialAnalysisIssues = useMemo(
    () =>
      createPartialAnalysisIssues(
        dataQualitySummary,
        amountWarningCounts,
      ),
    [dataQualitySummary, amountWarningCounts],
  );
  const limitationIssues = useMemo(
    () =>
      createAnalysisLimitationIssues({
        latestBalanceAvailable: latestBalance !== null,
        recurringTransactionCount: recurringTransactions.length,
        storageAvailable: sessionStorageAvailable,
      }),
    [
      latestBalance,
      recurringTransactions.length,
      sessionStorageAvailable,
    ],
  );

  function clearAnalysisResults() {
    setSheetDetection(null);
    setAnalysisMode(null);
    setColumnMappings([]);
    setTransactions([]);
    setSummary(null);
    setMonthlySummaries([]);
    setCategorySummaries([]);
    setMonthlyCategorySummaries([]);
    setInsights([]);
    setAmountWarningCounts({
      invalidAmountCount: 0,
      unknownDirectionCount: 0,
      directionConflictCount: 0,
      directionOverrideCount: 0,
      columnConflictCount: 0,
    });
  }

  function resetFileInfo() {
    setWorkbook(null);
    setFileName("");
    setFileSize("");
    setSheetDetection(null);
    setAutomaticSheetDetection(null);
    setAnalysisMode(null);
    setManualMapping(null);
    setManualMappingOpen(false);
    setManualMappingErrors([]);
    setColumnMappings([]);
    setTransactions([]);
    setSummary(null);
    setMonthlySummaries([]);
    setCategorySummaries([]);
    setMonthlyCategorySummaries([]);
    setInsights([]);
    setScheduledTransactions([]);
    setSelectedScenario(DEFAULT_FORECAST_SCENARIO);
    setSessionStorageAvailable(true);
    setAmountWarningCounts({
      invalidAmountCount: 0,
      unknownDirectionCount: 0,
      directionConflictCount: 0,
      directionOverrideCount: 0,
      columnConflictCount: 0,
    });
  }

  function saveCurrentFileSettings(
    nextScenario: ForecastScenario,
    nextScheduledTransactions: ScheduledTransaction[],
  ) {
    if (!fileName) {
      return;
    }

    setSessionStorageAvailable(
      saveUserFileSession(fileName, {
        selectedScenario: nextScenario,
        scheduledTransactions: nextScheduledTransactions,
      }),
    );
  }

  function handleScenarioChange(scenario: ForecastScenario) {
    setSelectedScenario(scenario);
    saveCurrentFileSettings(scenario, scheduledTransactions);
  }

  function handleScheduledTransactionAdd(
    scheduledTransaction: ScheduledTransaction,
  ) {
    const nextScheduledTransactions = [
      ...scheduledTransactions,
      scheduledTransaction,
    ];

    setScheduledTransactions(nextScheduledTransactions);
    saveCurrentFileSettings(
      selectedScenario,
      nextScheduledTransactions,
    );
  }

  function handleScheduledTransactionRemove(id: string) {
    const nextScheduledTransactions = scheduledTransactions.filter(
      (transaction) => transaction.id !== id,
    );

    setScheduledTransactions(nextScheduledTransactions);
    saveCurrentFileSettings(
      selectedScenario,
      nextScheduledTransactions,
    );
  }

  function handleCurrentFileSettingsReset() {
    const cleared = clearUserSession(fileName);

    setScheduledTransactions([]);
    setSelectedScenario(DEFAULT_FORECAST_SCENARIO);
    setSessionStorageAvailable(cleared);
  }

  function createManualPrefillForLocation(
    sourceWorkbook: ExcelWorkbook,
    sheetName: string,
    headerRowIndex: number,
  ): ManualTransactionMapping {
    const preview = sourceWorkbook.getPreview(sheetName, headerRowIndex);
    const automaticMappings = mapColumns(preview.columns, preview.rows);

    return createManualMappingPrefill(
      sheetName,
      headerRowIndex,
      automaticMappings,
    );
  }

  function applyWorkbookAnalysis(
    sourceWorkbook: ExcelWorkbook,
    selectedSheetName: string,
    headerRowIndex: number,
    mappings: ColumnMapping[],
    mode: AnalysisMode,
    automaticDetection: SheetDetectionResult | null = null,
  ) {
    const objectRows = sourceWorkbook.getRows(
      selectedSheetName,
      headerRowIndex,
    );
    const standardizedRows = standardizeTransactionRows(
      objectRows,
      mappings,
    );
    const parsedResult = parseTransactions(standardizedRows, {
      date1904: sourceWorkbook.date1904,
    });
    const validTransactionRowCount = countValidManualTransactions(
      parsedResult.transactions,
    );

    if (validTransactionRowCount === 0) {
      throw new NoValidTransactionsError();
    }

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
      aggregateMonthlyExpensesByCategory(parsedResult.transactions);
    const generatedInsights = generateFinancialInsights(
      monthlyResults,
      categoryResults,
      monthlyCategoryResults,
    );
    const activeDetection =
      mode === "automatic" && automaticDetection
        ? automaticDetection
        : {
            sheetName: selectedSheetName,
            sheetIndex:
              sourceWorkbook.sheetNames.indexOf(selectedSheetName),
            headerRowIndex,
            score: 0,
            confidence: "high" as const,
            reasons: ["사용자가 분석 시트와 컬럼을 직접 지정함"],
            validTransactionRowCount,
            sampledDataRowCount: objectRows.length,
            coreColumnCount: mappings.filter(
              (mapping) => mapping.standardName !== "unknown",
            ).length,
            amountStructure: getManualAmountStructure(
              manualMapping?.amountMode ?? "split",
            ),
            ambiguous: false,
          };

    setSheetDetection(activeDetection);
    setColumnMappings(mappings);
    setTransactions(parsedResult.transactions);
    setSummary(financialSummary);
    setMonthlySummaries(monthlyResults);
    setCategorySummaries(categoryResults);
    setMonthlyCategorySummaries(monthlyCategoryResults);
    setInsights(generatedInsights);
    setAnalysisMode(mode);
    setAmountWarningCounts({
      invalidAmountCount: parsedResult.invalidAmountCount,
      unknownDirectionCount: parsedResult.unknownDirectionCount,
      directionConflictCount: parsedResult.directionConflictCount,
      directionOverrideCount: parsedResult.directionOverrideCount,
      columnConflictCount: parsedResult.columnConflictCount,
    });
  }

  function handleManualSheetChange(sheetName: string) {
    if (!workbook) {
      return;
    }

    setManualMapping(createManualPrefillForLocation(workbook, sheetName, 0));
    setManualMappingErrors([]);
  }

  function handleManualHeaderRowChange(headerRowIndex: number) {
    if (!workbook || !manualMapping) {
      return;
    }

    setManualMapping(
      createManualPrefillForLocation(
        workbook,
        manualMapping.sheetName,
        headerRowIndex,
      ),
    );
    setManualMappingErrors([]);
  }

  function handleManualAnalysis() {
    if (!workbook || !manualMapping) {
      return;
    }

    const validationErrors = validateManualMapping(manualMapping, {
      sheetNames: workbook.sheetNames,
      columns: manualWorksheetPreview.columns,
      headerRowLimit: manualWorksheetPreview.headerRowLimit,
    });

    if (validationErrors.length > 0) {
      setManualMappingErrors(validationErrors);
      return;
    }

    const mappings = convertManualMappingToColumnMappings(
      manualMapping,
      manualWorksheetPreview.columns,
    );

    try {
      applyWorkbookAnalysis(
        workbook,
        manualMapping.sheetName,
        manualMapping.headerRowIndex,
        mappings,
        "manual",
      );
      setManualMappingErrors([]);
      setBlockingIssue(null);
    } catch (caughtError) {
      if (caughtError instanceof NoValidTransactionsError) {
        const issue = createBlockingAnalysisIssue("noValidTransactions");

        clearAnalysisResults();
        setBlockingIssue(issue);
        setManualMappingErrors([
          "유효한 거래가 없습니다. 거래일·금액 컬럼과 원본 값을 다시 확인해주세요.",
        ]);
        return;
      }

      setManualMappingErrors([
        "선택한 설정으로 분석하지 못했습니다. 헤더 행과 컬럼 선택을 다시 확인해주세요.",
      ]);
    }
  }

  function handleReturnToAutomatic() {
    if (!workbook || !automaticSheetDetection) {
      return;
    }

    const preview = workbook.getPreview(
      automaticSheetDetection.sheetName,
      automaticSheetDetection.headerRowIndex,
    );
    const rows = workbook.getRows(
      automaticSheetDetection.sheetName,
      automaticSheetDetection.headerRowIndex,
    );
    const mappings = mapColumns(preview.columns, rows);

    try {
      applyWorkbookAnalysis(
        workbook,
        automaticSheetDetection.sheetName,
        automaticSheetDetection.headerRowIndex,
        mappings,
        "automatic",
        automaticSheetDetection,
      );
      setManualMapping(
        createManualMappingPrefill(
          automaticSheetDetection.sheetName,
          automaticSheetDetection.headerRowIndex,
          mappings,
        ),
      );
      setManualMappingErrors([]);
      setManualMappingOpen(false);
      setBlockingIssue(null);
    } catch (caughtError) {
      if (caughtError instanceof NoValidTransactionsError) {
        clearAnalysisResults();
        setBlockingIssue(
          createBlockingAnalysisIssue("noValidTransactions"),
        );
        return;
      }

      setBlockingIssue(
        createBlockingAnalysisIssue("workbookReadFailed"),
      );
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isProcessingFile) {
      return;
    }

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setBlockingIssue(null);
    resetFileInfo();

    const allowedExtensions = [".xlsx", ".xls"];
    const dotIndex = file.name.lastIndexOf(".");
    const extension =
      dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : "";

    if (!allowedExtensions.includes(extension)) {
      setBlockingIssue(createBlockingAnalysisIssue("unsupportedFile"));
      event.target.value = "";
      return;
    }

    setIsProcessingFile(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uploadedWorkbook = await loadExcelWorkbook(arrayBuffer);

      if (uploadedWorkbook.sheetNames.length === 0) {
        throw new Error("workbook-without-sheets");
      }

      const restoredFileSession = loadUserFileSession(file.name);
      const savedRestoredSession = restoredFileSession.storageAvailable
        ? saveUserFileSession(file.name, restoredFileSession.session)
        : false;

      setWorkbook(uploadedWorkbook);
      setFileName(file.name);
      setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
      setScheduledTransactions(
        restoredFileSession.session.scheduledTransactions,
      );
      setSelectedScenario(restoredFileSession.session.selectedScenario);
      setSessionStorageAvailable(savedRestoredSession);

      const sheetCandidates = uploadedWorkbook.getSheetCandidates();
      const detectedSheet = detectTransactionSheet(sheetCandidates, {
        date1904: uploadedWorkbook.date1904,
      });

      if (!detectedSheet) {
        const firstSheetName = uploadedWorkbook.sheetNames[0];

        setAutomaticSheetDetection(null);
        setManualMapping(
          createManualPrefillForLocation(
            uploadedWorkbook,
            firstSheetName,
            0,
          ),
        );
        setBlockingIssue(
          createBlockingAnalysisIssue("transactionSheetNotFound"),
        );
        return;
      }

      const automaticPreview = uploadedWorkbook.getPreview(
        detectedSheet.sheetName,
        detectedSheet.headerRowIndex,
      );
      const automaticRows = uploadedWorkbook.getRows(
        detectedSheet.sheetName,
        detectedSheet.headerRowIndex,
      );
      const mappings = mapColumns(
        automaticPreview.columns,
        automaticRows,
      );

      setAutomaticSheetDetection(detectedSheet);
      setManualMapping(
        createManualMappingPrefill(
          detectedSheet.sheetName,
          detectedSheet.headerRowIndex,
          mappings,
        ),
      );
      applyWorkbookAnalysis(
        uploadedWorkbook,
        detectedSheet.sheetName,
        detectedSheet.headerRowIndex,
        mappings,
        "automatic",
        detectedSheet,
      );
      setBlockingIssue(null);
    } catch (caughtError) {
      if (caughtError instanceof NoValidTransactionsError) {
        clearAnalysisResults();
        setBlockingIssue(
          createBlockingAnalysisIssue("noValidTransactions"),
        );
        return;
      }

      resetFileInfo();
      setBlockingIssue(
        createBlockingAnalysisIssue("workbookReadFailed"),
      );
    } finally {
      setIsProcessingFile(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <OnboardingSection visible={!fileName && !isProcessingFile} />
      <section className="screen-only rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <FileUploadSection
        fileName={fileName}
        fileSize={fileSize}
        sheetNames={sheetNames}
        sheetDetection={sheetDetection}
        automaticSheetDetection={automaticSheetDetection}
        analysisMode={analysisMode}
        isProcessingFile={isProcessingFile}
        manualMappingOpen={manualMappingOpen}
        canConfigureManual={
          workbook !== null &&
          manualMapping !== null &&
          blockingIssue === null
        }
        onFileChange={handleFileChange}
        onToggleManualMapping={() => {
          setManualMappingOpen((isOpen) => !isOpen);
          setManualMappingErrors([]);
        }}
        onReturnToAutomatic={handleReturnToAutomatic}
      />

      {blockingIssue && (
        <AnalysisIssuePanel
          issues={[blockingIssue]}
          ctaLabel={
            workbook && manualMapping && !manualMappingOpen
              ? "직접 설정해서 분석"
              : undefined
          }
          onCta={
            workbook && manualMapping && !manualMappingOpen
              ? () => {
                  setManualMappingOpen(true);
                  setManualMappingErrors([]);
                }
              : undefined
          }
        />
      )}

      {manualMappingOpen && workbook && manualMapping && (
        <ManualMappingPanel
          sheetNames={workbook.sheetNames}
          mapping={manualMapping}
          preview={manualWorksheetPreview}
          errors={manualMappingErrors}
          canReturnToAutomatic={
            analysisMode === "manual" && automaticSheetDetection !== null
          }
          onSheetChange={handleManualSheetChange}
          onHeaderRowChange={handleManualHeaderRowChange}
          onMappingChange={(mapping) => {
            setManualMapping(mapping);
            setManualMappingErrors([]);
          }}
          onAnalyze={handleManualAnalysis}
          onReturnToAutomatic={handleReturnToAutomatic}
        />
      )}

      {summary && sheetDetection && (
        <div className="mt-5 flex justify-end">
          <ReportPrintButton visible />
        </div>
      )}

      {summary && partialAnalysisIssues.length > 0 && (
        <AnalysisIssuePanel
          issues={partialAnalysisIssues}
          heading="일부 거래가 분석에서 제외되거나 확인이 필요합니다."
        />
      )}

      {summary && (
        <DashboardOverview
          latestBalance={latestBalance}
          latestMonthlySummary={monthlySummaries.at(-1) ?? null}
          forecastSummary={selectedForecastSummary}
          selectedScenario={selectedScenario}
        />
      )}

      {summary && (
        <div className="mt-6">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">
              1. 현재 상태
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              업로드한 기간 전체의 입출금 합계입니다. 순현금흐름은 들어온
              돈에서 나간 돈을 뺀 금액입니다.
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
                    ? "text-emerald-700"
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
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {formatCurrency(latestBalance)}
              </p>
            </div>
          )}

        </div>
      )}

      {summary && limitationIssues.length > 0 && (
        <AnalysisIssuePanel issues={limitationIssues} />
      )}

      {forecasts.length > 0 && (
        <ScheduledTransactionSection
          key={fileName}
          forecastMonths={forecasts.map((forecast) => forecast.month)}
          scheduledTransactions={scheduledTransactions}
          outOfPeriodCount={outOfPeriodScheduledTransactions.length}
          onAdd={handleScheduledTransactionAdd}
          onRemove={handleScheduledTransactionRemove}
          onReset={handleCurrentFileSettingsReset}
        />
      )}

      {summary && forecasts.length > 0 && (
        <ForecastSection
          analysis={selectedAnalysis}
          summary={selectedForecastSummary}
          selectedScenario={selectedScenario}
          onScenarioChange={handleScenarioChange}
          actionGuideItems={actionGuideItems}
        />
      )}

      {summary && (
        <div className="mt-10 border-t border-slate-200 pt-7">
          <p className="text-xs font-semibold tracking-wide text-slate-500">
            4. 상세 분석
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">
            거래 내역을 더 자세히 살펴보세요
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            분석에 포함된 거래, 월별 흐름, 반복 거래와 지출 구성을
            확인할 수 있습니다.
          </p>
        </div>
      )}

      {transactions.length > 0 && (
        <DataQualitySummary summary={dataQualitySummary} />
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
                          ? "text-emerald-700"
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
        <div id="transaction-classification" className="mt-6 scroll-mt-4">
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
            {analysisMode === "manual"
              ? "사용자 지정 컬럼 매핑"
              : "컬럼 자동 인식 결과"}
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
                    {analysisMode === "manual" ? "설정" : "신뢰도"}
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
                      {analysisMode === "manual" ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          사용자 지정
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${getConfidenceStyle(
                            mapping.confidence,
                          )}`}
                        >
                          {getConfidenceLabel(mapping.confidence)}
                        </span>
                      )}
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
