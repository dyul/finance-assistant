import { aggregateExpensesByCategory, type CategorySummary } from "./categoryAggregator";
import { normalizeTransactionDate, type NormalizedDate } from "./dateNormalizer";
import { calculateFinancialSummary } from "./financialEngine";
import {
  aggregateHistoricalPeriods,
  type HistoricalPeriodAggregation,
} from "./historicalPeriodAggregator";
import { getLatestBalance } from "./forecastEngine";
import type { Transaction } from "./transactionParser";

export type HistoricalRangeMode = "all" | "custom";

export interface HistoricalDateRange {
  startDate: NormalizedDate;
  endDate: NormalizedDate;
}

export interface HistoricalRangeSummary {
  income: number;
  expense: number;
  netCashFlow: number;
  transactionCount: number;
  closingBalance: number | null;
}

export interface HistoricalRangeAnalysis {
  range: HistoricalDateRange | null;
  dataRange: HistoricalDateRange | null;
  transactions: Transaction[];
  summary: HistoricalRangeSummary;
  aggregation: HistoricalPeriodAggregation;
  categorySummaries: CategorySummary[];
  topExpense: CategorySummary | null;
  isEmpty: boolean;
}

export type HistoricalRangeValidationResult =
  | { valid: true; range: HistoricalDateRange }
  | { valid: false; message: string };

export interface HistoricalRangeState {
  mode: HistoricalRangeMode;
  draftStartDate: string;
  draftEndDate: string;
  appliedRange: HistoricalDateRange | null;
  error: string | null;
}

export type HistoricalRangeAction =
  | { type: "selectMode"; mode: HistoricalRangeMode }
  | { type: "setDraftStartDate"; value: string }
  | { type: "setDraftEndDate"; value: string }
  | { type: "apply"; maximumDate: NormalizedDate }
  | { type: "reset" };

export function createInitialHistoricalRangeState(): HistoricalRangeState {
  return {
    mode: "all",
    draftStartDate: "",
    draftEndDate: "",
    appliedRange: null,
    error: null,
  };
}

function isStrictNormalizedDate(value: string): value is NormalizedDate {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    normalizeTransactionDate(value) === value
  );
}

export function validateHistoricalDateRange(
  startDate: string,
  endDate: string,
  maximumDate?: NormalizedDate,
): HistoricalRangeValidationResult {
  if (startDate === "" || endDate === "") {
    return {
      valid: false,
      message: "시작일과 종료일을 모두 선택해주세요.",
    };
  }

  if (!isStrictNormalizedDate(startDate) || !isStrictNormalizedDate(endDate)) {
    return {
      valid: false,
      message: "유효한 시작일과 종료일을 입력해주세요.",
    };
  }

  if (startDate > endDate) {
    return {
      valid: false,
      message: "시작일은 종료일보다 늦을 수 없습니다.",
    };
  }

  if (maximumDate !== undefined && endDate > maximumDate) {
    return {
      valid: false,
      message: "종료일은 오늘보다 늦을 수 없습니다.",
    };
  }

  return {
    valid: true,
    range: { startDate, endDate },
  };
}

export function historicalRangeReducer(
  state: HistoricalRangeState,
  action: HistoricalRangeAction,
): HistoricalRangeState {
  if (action.type === "reset") {
    return createInitialHistoricalRangeState();
  }

  if (action.type === "selectMode") {
    return action.mode === "all"
      ? createInitialHistoricalRangeState()
      : { ...state, mode: "custom", error: null };
  }

  if (action.type === "setDraftStartDate") {
    return { ...state, draftStartDate: action.value, error: null };
  }

  if (action.type === "setDraftEndDate") {
    return { ...state, draftEndDate: action.value, error: null };
  }

  const validation = validateHistoricalDateRange(
    state.draftStartDate,
    state.draftEndDate,
    action.maximumDate,
  );

  return validation.valid
    ? {
        ...state,
        mode: "custom",
        appliedRange: validation.range,
        error: null,
      }
    : { ...state, error: validation.message };
}

function getDataRange(transactions: Transaction[]): HistoricalDateRange | null {
  let startDate: NormalizedDate | null = null;
  let endDate: NormalizedDate | null = null;

  for (const transaction of transactions) {
    if (transaction.date === null) {
      continue;
    }

    if (startDate === null || transaction.date < startDate) {
      startDate = transaction.date;
    }

    if (endDate === null || transaction.date > endDate) {
      endDate = transaction.date;
    }
  }

  return startDate === null || endDate === null
    ? null
    : { startDate, endDate };
}

export function analyzeHistoricalRange(
  historicalTransactions: Transaction[],
  range: HistoricalDateRange | null,
  fullRangeAggregation?: HistoricalPeriodAggregation,
): HistoricalRangeAnalysis {
  const datedTransactions = historicalTransactions.filter(
    (transaction) => transaction.date !== null,
  );
  const transactions =
    range === null
      ? datedTransactions
      : datedTransactions.filter(
          (transaction) =>
            transaction.date !== null &&
            transaction.date >= range.startDate &&
            transaction.date <= range.endDate,
        );
  const financialSummary = calculateFinancialSummary(transactions);
  const categorySummaries = aggregateExpensesByCategory(transactions);
  const aggregation =
    range === null && fullRangeAggregation !== undefined
      ? fullRangeAggregation
      : aggregateHistoricalPeriods(transactions);
  const summary: HistoricalRangeSummary = {
    income: financialSummary.totalIncome,
    expense: financialSummary.totalExpense,
    netCashFlow: financialSummary.netCashFlow,
    transactionCount: financialSummary.validAmountTransactionCount,
    closingBalance: getLatestBalance(transactions),
  };

  return {
    range,
    dataRange: getDataRange(historicalTransactions),
    transactions,
    summary,
    aggregation,
    categorySummaries,
    topExpense: categorySummaries[0] ?? null,
    isEmpty: summary.transactionCount === 0,
  };
}
