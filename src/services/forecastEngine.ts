import {
  createRecurringTransactionKey,
  type RecurringTransaction,
} from "./recurringTransactionDetector";
import type { Transaction } from "./transactionParser";
import {
  createTransactionChronologyCandidates,
  createTransactionChronologyComparator,
  type TransactionChronologyCandidate,
} from "./transactionChronology";
import type { ScheduledTransaction } from "./scheduledTransaction";
import { getTrendAdjustedIncome } from "./incomeTrend";
import {
  applyScenarioToRecurringIncome,
  calculateScenarioSpread,
  type ForecastScenario,
} from "./forecastScenario";
import {
  analyzeCashRisk,
  type CashRiskAnalysis,
} from "./cashRiskAnalyzer";

export interface MonthlyForecast {
  month: string;
  scenario: ForecastScenario;

  baseRecurringIncome: number;
  recurringIncome: number;
  scheduledIncome: number;
  expectedIncome: number;

  recurringExpense: number;
  scheduledExpense: number;
  expectedExpense: number;
  expectedNetCashFlow: number;

  startingBalance: number;
  expectedEndingBalance: number;

  recurringIncomeCount: number;
  recurringExpenseCount: number;
}

export interface ForecastAnalysis {
  forecasts: MonthlyForecast[];
  cashRisk: CashRiskAnalysis | null;
}

export type ScenarioForecastAnalyses = Record<
  ForecastScenario,
  ForecastAnalysis
>;

function getNextMonth(
  year: number,
  month: number,
  offset: number,
): {
  year: number;
  month: number;
} {
  const date = new Date(year, month - 1 + offset, 1);

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function getLatestBalance(
  transactions: Transaction[],
): number | null {
  const candidates = createTransactionChronologyCandidates(
    transactions,
  ).filter(
    ({ transaction }) =>
      transaction.date !== null && transaction.balance !== null,
  );
  const compareChronology =
    createTransactionChronologyComparator(candidates);
  let latestCandidate: TransactionChronologyCandidate | null = null;

  for (const candidate of candidates) {
    if (
      latestCandidate === null ||
      compareChronology(candidate, latestCandidate) >= 0
    ) {
      latestCandidate = candidate;
    }
  }

  return latestCandidate?.transaction.balance ?? null;
}

export function generateCashFlowForecast(
  recurringTransactions: RecurringTransaction[],
  startingBalance: number,
  forecastMonths = 3,
  scheduledTransactions: ScheduledTransaction[] = [],
  scenario: ForecastScenario = "base",
): MonthlyForecast[] {
  if (recurringTransactions.length === 0) {
    return [];
  }

  const latestMonth = recurringTransactions
    .map((transaction) => transaction.lastMonth)
    .sort()
    .at(-1);

  if (!latestMonth) {
    return [];
  }

  const [latestYearText, latestMonthText] =
    latestMonth.split("-");

  const latestYear = Number(latestYearText);
  const latestMonthNumber = Number(latestMonthText);

  if (
    !Number.isFinite(latestYear) ||
    !Number.isFinite(latestMonthNumber)
  ) {
    return [];
  }

  const forecasts: MonthlyForecast[] = [];

  let projectedBalance = startingBalance;

  for (
    let offset = 1;
    offset <= forecastMonths;
    offset += 1
  ) {
    const target = getNextMonth(
      latestYear,
      latestMonthNumber,
      offset,
    );

    const monthStartingBalance = projectedBalance;

    const forecastMonth = formatMonth(target.year, target.month);
    const monthlyScheduledTransactions = scheduledTransactions.filter(
      (transaction) => transaction.date.slice(0, 7) === forecastMonth,
    );
    const confirmedFileRecurringKeys = new Set(
      monthlyScheduledTransactions.flatMap((transaction) =>
        transaction.source === "file" && transaction.recurringKey
          ? [transaction.recurringKey]
          : [],
      ),
    );
    const activeRecurringTransactions = recurringTransactions.filter(
      (transaction) =>
        !confirmedFileRecurringKeys.has(
          createRecurringTransactionKey(transaction),
        ),
    );
    const baseRecurringIncome = activeRecurringTransactions.reduce(
      (total, transaction) =>
        transaction.type === "income"
          ? total + transaction.averageAmount
          : total,
      0,
    );
    const recurringExpense = activeRecurringTransactions.reduce(
      (total, transaction) =>
        transaction.type === "expense"
          ? total + transaction.averageAmount
          : total,
      0,
    );
    const recurringIncomeCount = activeRecurringTransactions.filter(
      (transaction) => transaction.type === "income",
    ).length;
    const recurringExpenseCount = activeRecurringTransactions.filter(
      (transaction) => transaction.type === "expense",
    ).length;
    const recurringIncome = activeRecurringTransactions.reduce(
      (total, transaction) => {
        if (transaction.type !== "income") {
          return total;
        }

        const trendAdjustedIncome = getTrendAdjustedIncome(
          transaction.monthlyAmounts,
          forecastMonth,
          transaction.averageAmount,
        );
        const scenarioSpread = calculateScenarioSpread(
          transaction.monthlyAmounts,
        );

        return (
          total +
          applyScenarioToRecurringIncome(
            trendAdjustedIncome,
            scenarioSpread,
            scenario,
          )
        );
      },
      0,
    );

    const scheduledIncome = monthlyScheduledTransactions.reduce(
      (total, transaction) =>
        transaction.type === "income"
          ? total + transaction.amount
          : total,
      0,
    );

    const scheduledExpense = monthlyScheduledTransactions.reduce(
      (total, transaction) =>
        transaction.type === "expense"
          ? total + transaction.amount
          : total,
      0,
    );

    const expectedIncome = recurringIncome + scheduledIncome;
    const expectedExpense = recurringExpense + scheduledExpense;
    const expectedNetCashFlow = expectedIncome - expectedExpense;

    projectedBalance =
      monthStartingBalance + expectedNetCashFlow;

    forecasts.push({
      month: forecastMonth,
      scenario,

      baseRecurringIncome,
      recurringIncome,
      scheduledIncome,
      expectedIncome,

      recurringExpense,
      scheduledExpense,
      expectedExpense,
      expectedNetCashFlow,

      startingBalance: monthStartingBalance,
      expectedEndingBalance: projectedBalance,

      recurringIncomeCount,
      recurringExpenseCount,
    });
  }

  return forecasts;
}

export function createForecastAnalysis(
  recurringTransactions: RecurringTransaction[],
  currentBalance: number | null,
  scheduledTransactions: ScheduledTransaction[] = [],
  scenario: ForecastScenario = "base",
): ForecastAnalysis {
  if (currentBalance === null) {
    return {
      forecasts: [],
      cashRisk: null,
    };
  }

  const forecasts = generateCashFlowForecast(
    recurringTransactions,
    currentBalance,
    3,
    scheduledTransactions,
    scenario,
  );

  return {
    forecasts,
    cashRisk: analyzeCashRisk(forecasts),
  };
}

export function createScenarioForecastAnalyses(
  recurringTransactions: RecurringTransaction[],
  currentBalance: number | null,
  scheduledTransactions: ScheduledTransaction[] = [],
): ScenarioForecastAnalyses {
  return {
    conservative: createForecastAnalysis(
      recurringTransactions,
      currentBalance,
      scheduledTransactions,
      "conservative",
    ),
    base: createForecastAnalysis(
      recurringTransactions,
      currentBalance,
      scheduledTransactions,
      "base",
    ),
    optimistic: createForecastAnalysis(
      recurringTransactions,
      currentBalance,
      scheduledTransactions,
      "optimistic",
    ),
  };
}
