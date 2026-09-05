import {
  useMemo,
  useReducer,
  useRef,
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
import TransactionClassificationTable from "./TransactionClassificationTable";
import RecurringTransactionsTable from "./RecurringTransactionsTable";
import ManualBalanceSection from "./ManualBalanceSection";
import FutureSourceTransactionsSection from "./FutureSourceTransactionsSection";
import { HistoricalCashFlowSectionView } from "./HistoricalCashFlowSection";
import CashBalanceTrendSection from "./CashBalanceTrendSection";

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
import {
  getUploadFileType,
  validateExcelUpload,
} from "../services/excelUploadValidation";
import {
  CsvLoadError,
  loadCsvDataSource,
} from "../services/csvDataSource";
import type { TransactionDataSource } from "../services/transactionDataSource";
import {
  createAnalysisLimitationIssues,
  createBlockingAnalysisIssue,
  createPartialAnalysisIssues,
  type AnalysisIssue,
} from "../services/analysisIssuePresentation";
import { createLatestRequestGate } from "../services/latestRequestGate";
import type { NormalizedDate } from "../services/dateNormalizer";
import {
  getLocalDateKey,
  partitionTransactionsByReferenceDate,
} from "../services/transactionDateScope";
import {
  manualBalanceSessionReducer,
  resolveForecastStartingBalance,
} from "../services/manualBalance";
import {
  createFutureSourceTransactions,
  futureSourceSelectionReducer,
  partitionFutureSourceTransactionsByForecastMonths,
  toFileScheduledTransactions,
} from "../services/futureSourceTransaction";
import {
  formatCurrency,
  formatSignedCurrency,
} from "../utils/formatters";
import {
  aggregateHistoricalPeriods,
  type HistoricalPeriodUnit,
} from "../services/historicalPeriodAggregator";
import { createCashBalanceTrendModel } from "../services/cashBalanceTrend";
import {
  analyzeHistoricalRange,
  createInitialHistoricalRangeState,
  historicalRangeReducer,
} from "../services/historicalRangeAnalyzer";

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
    ["실적 분석 포함", summary.historicalTransactionCount],
    ["금액 계산 포함", summary.amountIncludedCount],
    ["날짜 기반 분석 포함", summary.dateAnalysisIncludedCount],
    ["금액 확인 필요", summary.invalidAmountCount],
    ["날짜 확인 필요", summary.invalidDateCount],
    ["입출금 구분 확인 필요", summary.directionIssueCount],
    ["미래 날짜 거래", summary.futureDatedTransactionCount],
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
  const [workbook, setWorkbook] = useState<TransactionDataSource | null>(null);
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
  const [analysisTransactions, setAnalysisTransactions] = useState<
    Transaction[]
  >([]);
  const [analysisReferenceDate, setAnalysisReferenceDate] =
    useState<NormalizedDate>(() => getLocalDateKey());
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
  const [historicalPeriodUnit, setHistoricalPeriodUnit] =
    useState<HistoricalPeriodUnit>("monthly");
  const [historicalPeriodsExpanded, setHistoricalPeriodsExpanded] =
    useState(false);
  const [historicalRangeState, dispatchHistoricalRange] = useReducer(
    historicalRangeReducer,
    undefined,
    createInitialHistoricalRangeState,
  );

  const [scheduledTransactions, setScheduledTransactions] = useState<
    ScheduledTransaction[]
  >([]);
  const [excludedFutureTransactionIds, dispatchFutureSourceSelection] =
    useReducer(futureSourceSelectionReducer, []);
  const [selectedScenario, setSelectedScenario] =
    useState<ForecastScenario>(DEFAULT_FORECAST_SCENARIO);
  const [manualCurrentBalance, dispatchManualBalance] = useReducer(
    manualBalanceSessionReducer,
    null,
  );
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
    () => detectRecurringTransactions(analysisTransactions),
    [analysisTransactions],
  );
  const historicalPeriodAggregation = useMemo(
    () => aggregateHistoricalPeriods(analysisTransactions),
    [analysisTransactions],
  );
  const historicalRangeAnalysis = useMemo(
    () =>
      analyzeHistoricalRange(
        analysisTransactions,
        historicalRangeState.appliedRange,
        historicalPeriodAggregation,
      ),
    [
      analysisTransactions,
      historicalPeriodAggregation,
      historicalRangeState.appliedRange,
    ],
  );
  const fileLatestBalance = useMemo(
    () => getLatestBalance(analysisTransactions),
    [analysisTransactions],
  );
  const forecastStartingBalance = useMemo(
    () =>
      resolveForecastStartingBalance(
        fileLatestBalance,
        manualCurrentBalance,
      ),
    [fileLatestBalance, manualCurrentBalance],
  );
  const dataQualitySummary = useMemo(
    () =>
      analyzeDataQuality(transactions, {
        referenceDate: analysisReferenceDate,
      }),
    [analysisReferenceDate, transactions],
  );
  const futureSourceTransactions = useMemo(
    () =>
      createFutureSourceTransactions(
        transactions,
        analysisReferenceDate,
      ),
    [analysisReferenceDate, transactions],
  );
  const excludedFutureTransactionIdSet = useMemo(
    () => new Set(excludedFutureTransactionIds),
    [excludedFutureTransactionIds],
  );
  const forecastMonths = useMemo(
    () =>
      createScenarioForecastAnalyses(
        recurringTransactions,
        forecastStartingBalance.value,
      ).base.forecasts.map((forecast) => forecast.month),
    [recurringTransactions, forecastStartingBalance.value],
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
  const futureSourceForecastScope = useMemo(
    () =>
      partitionFutureSourceTransactionsByForecastMonths(
        futureSourceTransactions,
        forecastMonths,
        excludedFutureTransactionIdSet,
      ),
    [
      excludedFutureTransactionIdSet,
      forecastMonths,
      futureSourceTransactions,
    ],
  );
  const forecastScheduledTransactions = useMemo(
    () => [
      ...applicableScheduledTransactions,
      ...toFileScheduledTransactions(futureSourceForecastScope.included),
    ],
    [applicableScheduledTransactions, futureSourceForecastScope.included],
  );
  const scenarioAnalyses = useMemo(
    () =>
      createScenarioForecastAnalyses(
        recurringTransactions,
        forecastStartingBalance.value,
        forecastScheduledTransactions,
      ),
    [
      recurringTransactions,
      forecastStartingBalance.value,
      forecastScheduledTransactions,
    ],
  );
  const selectedAnalysis = scenarioAnalyses[selectedScenario];
  const { forecasts } = selectedAnalysis;
  const cashBalanceTrendModel = useMemo(
    () =>
      createCashBalanceTrendModel({
        monthlySummaries: historicalPeriodAggregation.monthly,
        startingBalance: forecastStartingBalance,
        forecasts: selectedAnalysis.forecasts,
        scenario: selectedScenario,
        referenceDate: analysisReferenceDate,
      }),
    [
      analysisReferenceDate,
      forecastStartingBalance,
      historicalPeriodAggregation.monthly,
      selectedAnalysis.forecasts,
      selectedScenario,
    ],
  );
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
        scheduledTransactions: forecastScheduledTransactions,
      }),
    [
      selectedAnalysis,
      categorySummaries,
      monthlyCategorySummaries,
      forecastScheduledTransactions,
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
  const fileRequestGateRef = useRef(createLatestRequestGate());
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
        fileLatestBalanceAvailable: fileLatestBalance !== null,
        manualCurrentBalanceApplied: manualCurrentBalance !== null,
        recurringTransactionCount: recurringTransactions.length,
        storageAvailable: sessionStorageAvailable,
      }),
    [
      fileLatestBalance,
      manualCurrentBalance,
      recurringTransactions.length,
      sessionStorageAvailable,
    ],
  );

  function clearAnalysisResults() {
    setSheetDetection(null);
    setAnalysisMode(null);
    setColumnMappings([]);
    setTransactions([]);
    setAnalysisTransactions([]);
    setSummary(null);
    setMonthlySummaries([]);
    setCategorySummaries([]);
    setMonthlyCategorySummaries([]);
    setInsights([]);
    setHistoricalPeriodUnit("monthly");
    setHistoricalPeriodsExpanded(false);
    dispatchHistoricalRange({ type: "reset" });
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
    setAnalysisTransactions([]);
    setSummary(null);
    setMonthlySummaries([]);
    setCategorySummaries([]);
    setMonthlyCategorySummaries([]);
    setInsights([]);
    setHistoricalPeriodUnit("monthly");
    setHistoricalPeriodsExpanded(false);
    dispatchHistoricalRange({ type: "reset" });
    setScheduledTransactions([]);
    dispatchFutureSourceSelection({ type: "newFile" });
    setSelectedScenario(DEFAULT_FORECAST_SCENARIO);
    dispatchManualBalance({ type: "newFile" });
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
    dispatchFutureSourceSelection({ type: "fileSettingsReset" });
    setSelectedScenario(DEFAULT_FORECAST_SCENARIO);
    dispatchManualBalance({ type: "fileSettingsReset" });
    dispatchHistoricalRange({ type: "reset" });
    setSessionStorageAvailable(cleared);
  }

  function handleFutureTransactionInclusionChange(
    id: string,
    included: boolean,
  ) {
    dispatchFutureSourceSelection({ type: "setIncluded", id, included });
  }

  function createManualPrefillForLocation(
    sourceWorkbook: TransactionDataSource,
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
    sourceWorkbook: TransactionDataSource,
    selectedSheetName: string,
    headerRowIndex: number,
    mappings: ColumnMapping[],
    mode: AnalysisMode,
    automaticDetection: SheetDetectionResult | null = null,
    existingRows?: Record<string, unknown>[],
  ) {
    const objectRows =
      existingRows ??
      sourceWorkbook.getRows(selectedSheetName, headerRowIndex);
    const standardizedRows = standardizeTransactionRows(
      objectRows,
      mappings,
    );
    const parsedResult = parseTransactions(standardizedRows, {
      date1904: sourceWorkbook.date1904,
    });
    const referenceDate = getLocalDateKey();
    const transactionDateScope = partitionTransactionsByReferenceDate(
      parsedResult.transactions,
      referenceDate,
    );
    const validTransactionRowCount = countValidManualTransactions(
      transactionDateScope.historicalTransactions,
    );

    if (validTransactionRowCount === 0) {
      throw new NoValidTransactionsError();
    }

    const nextFutureSourceTransactionIds = createFutureSourceTransactions(
      parsedResult.transactions,
      referenceDate,
    ).map((transaction) => transaction.id);

    const financialSummary = calculateFinancialSummary(
      transactionDateScope.historicalTransactions,
    );
    const monthlyResults = aggregateMonthly(
      transactionDateScope.historicalTransactions,
    );
    const categoryResults = aggregateExpensesByCategory(
      transactionDateScope.historicalTransactions,
    );
    const monthlyCategoryResults =
      aggregateMonthlyExpensesByCategory(
        transactionDateScope.historicalTransactions,
      );
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
            reasons: ["사용자가 분석 대상과 컬럼을 직접 지정함"],
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
    dispatchFutureSourceSelection({
      type: "sameFileReanalyzed",
      availableIds: nextFutureSourceTransactionIds,
    });
    setColumnMappings(mappings);
    setTransactions(parsedResult.transactions);
    setAnalysisTransactions(transactionDateScope.historicalTransactions);
    setAnalysisReferenceDate(referenceDate);
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
      dispatchManualBalance({ type: "sameFileReanalyzed" });
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
        rows,
      );
      dispatchManualBalance({ type: "sameFileReanalyzed" });
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

    const input = event.currentTarget;
    const requestId = fileRequestGateRef.current.begin();
    const isLatestRequest = () =>
      fileRequestGateRef.current.isLatest(requestId);

    setBlockingIssue(null);
    resetFileInfo();

    const validationIssue = validateExcelUpload(file);
    const uploadFileType = getUploadFileType(file.name);

    if (validationIssue) {
      setBlockingIssue(createBlockingAnalysisIssue(validationIssue));
      setIsProcessingFile(false);
      input.value = "";
      return;
    }

    setIsProcessingFile(true);

    try {
      const arrayBuffer = await file.arrayBuffer();

      if (!isLatestRequest()) {
        return;
      }

      const uploadedWorkbook =
        uploadFileType === "csv"
          ? loadCsvDataSource(arrayBuffer)
          : await loadExcelWorkbook(arrayBuffer);

      if (!isLatestRequest()) {
        return;
      }

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
          createBlockingAnalysisIssue(
            uploadedWorkbook.sourceType === "csv"
              ? "csvHeaderNotFound"
              : "transactionSheetNotFound",
          ),
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
        automaticRows,
      );
      setBlockingIssue(null);
    } catch (caughtError) {
      if (!isLatestRequest()) {
        return;
      }

      if (caughtError instanceof NoValidTransactionsError) {
        clearAnalysisResults();
        setBlockingIssue(
          createBlockingAnalysisIssue("noValidTransactions"),
        );
        return;
      }

      resetFileInfo();
      setBlockingIssue(
        createBlockingAnalysisIssue(
          uploadFileType === "csv"
            ? caughtError instanceof CsvLoadError &&
              caughtError.code === "decodingFailed"
              ? "csvDecodingFailed"
              : "csvReadFailed"
            : "workbookReadFailed",
        ),
      );
    } finally {
      if (isLatestRequest()) {
        setIsProcessingFile(false);
        input.value = "";
      }
    }
  }

  return (
    <>
      <OnboardingSection visible={!fileName && !isProcessingFile} />
      <section className="screen-only rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <FileUploadSection
        fileName={fileName}
        fileSize={fileSize}
        sourceType={workbook?.sourceType ?? null}
        textEncoding={workbook?.textEncoding}
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
          sourceType={workbook.sourceType}
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
          currentBalance={forecastStartingBalance.value}
          startingBalanceSource={forecastStartingBalance.source}
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
              오늘까지의 실적 분석에 포함된 입출금 합계입니다. 순현금흐름은
              들어온 돈에서 나간 돈을 뺀 금액입니다.
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
              <p className="text-sm text-slate-500">실적 분석 거래</p>
              <p className="mt-2 text-xl font-bold text-slate-900">
                {summary.transactionCount.toLocaleString("ko-KR")}건
              </p>
            </div>
          </div>

          {forecastStartingBalance.value !== null && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                {forecastStartingBalance.source === "manual"
                  ? "현재 잔액 (직접 입력)"
                  : "최근 거래 기준 잔액"}
              </p>

              <p
                className={`mt-1 text-lg font-bold ${
                  forecastStartingBalance.value >= 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {formatCurrency(forecastStartingBalance.value)}
              </p>
              {forecastStartingBalance.source === "manual" && (
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Forecast 시작 잔액으로만 사용하며 과거 실적에는 반영하지
                  않습니다.
                </p>
              )}
            </div>
          )}

        </div>
      )}

      {summary && limitationIssues.length > 0 && (
        <AnalysisIssuePanel issues={limitationIssues} />
      )}

      {summary && (
        <ManualBalanceSection
          fileLatestBalance={fileLatestBalance}
          manualCurrentBalance={manualCurrentBalance}
          onApply={(balance) =>
            dispatchManualBalance({ type: "apply", balance })
          }
          onClear={() => dispatchManualBalance({ type: "clear" })}
        />
      )}

      {summary && forecasts.length > 0 && futureSourceTransactions.length > 0 && (
        <FutureSourceTransactionsSection
          key={`future-source-transactions-${fileName}`}
          transactions={futureSourceTransactions}
          forecastMonths={forecasts.map((forecast) => forecast.month)}
          excludedIds={excludedFutureTransactionIdSet}
          onInclusionChange={handleFutureTransactionInclusionChange}
        />
      )}

      {forecasts.length > 0 && (
        <ScheduledTransactionSection
          key={`scheduled-transactions-${fileName}`}
          forecastMonths={forecasts.map((forecast) => forecast.month)}
          scheduledTransactions={scheduledTransactions}
          outOfPeriodCount={outOfPeriodScheduledTransactions.length}
          fileFutureTransactionCount={futureSourceForecastScope.included.length}
          onAdd={handleScheduledTransactionAdd}
          onRemove={handleScheduledTransactionRemove}
          onReset={handleCurrentFileSettingsReset}
        />
      )}

      {summary && forecasts.length === 0 && (
        <CashBalanceTrendSection model={cashBalanceTrendModel} />
      )}

      {summary && forecasts.length > 0 && (
        <ForecastSection
          analysis={selectedAnalysis}
          summary={selectedForecastSummary}
          selectedScenario={selectedScenario}
          onScenarioChange={handleScenarioChange}
          actionGuideItems={actionGuideItems}
          startingBalanceSource={forecastStartingBalance.source}
          balanceTrendModel={cashBalanceTrendModel}
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

      {summary && (
        <HistoricalCashFlowSectionView
          analysis={historicalRangeAnalysis}
          rangeState={historicalRangeState}
          referenceDate={analysisReferenceDate}
          unit={historicalPeriodUnit}
          expanded={historicalPeriodsExpanded}
          onRangeModeChange={(mode) => {
            dispatchHistoricalRange({ type: "selectMode", mode });
            setHistoricalPeriodsExpanded(false);
          }}
          onDraftStartDateChange={(value) =>
            dispatchHistoricalRange({ type: "setDraftStartDate", value })
          }
          onDraftEndDateChange={(value) =>
            dispatchHistoricalRange({ type: "setDraftEndDate", value })
          }
          onRangeApply={() => {
            dispatchHistoricalRange({
              type: "apply",
              maximumDate: analysisReferenceDate,
            });
            setHistoricalPeriodsExpanded(false);
          }}
          onUnitChange={(unit) => {
            setHistoricalPeriodUnit(unit);
            setHistoricalPeriodsExpanded(false);
          }}
          onExpandedChange={setHistoricalPeriodsExpanded}
        />
      )}

      {recurringTransactions.length > 0 && (
        <RecurringTransactionsTable
          recurringTransactions={recurringTransactions}
        />
      )}

      {(historicalRangeState.appliedRange
        ? historicalRangeAnalysis.categorySummaries
        : categorySummaries
      ).length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-semibold text-slate-900">
            {historicalRangeState.appliedRange
              ? "선택 기간 카테고리별 지출 분석"
              : "카테고리별 지출 분석"}
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
                {(historicalRangeState.appliedRange
                  ? historicalRangeAnalysis.categorySummaries
                  : categorySummaries
                ).map((item) => (
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
        <TransactionClassificationTable
          key={`transaction-classification-${fileName}`}
          transactions={transactions}
          referenceDate={analysisReferenceDate}
        />
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
          fileLatestBalance={fileLatestBalance}
          forecastStartingBalance={forecastStartingBalance.value}
          forecastStartingBalanceSource={forecastStartingBalance.source}
          dataQuality={dataQualitySummary}
          monthlySummaries={monthlySummaries}
          analysis={selectedAnalysis}
          selectedScenario={selectedScenario}
          actionGuideItems={actionGuideItems}
          categorySummaries={categorySummaries}
          futureSourceForecastScope={futureSourceForecastScope}
        />
      )}
    </>
  );
}
