import type { RecurringTransaction } from "./recurringTransactionDetector";
import type { Transaction } from "./transactionParser";
import {
  analyzeCashRisk,
  type CashRiskAnalysis,
} from "./cashRiskAnalyzer";

export interface MonthlyForecast {
  month: string;

  expectedIncome: number;
  expectedExpense: number;
  expectedNetCashFlow: number;

  startingBalance: number;
  expectedEndingBalance: number;

  recurringIncomeCount: number;
  recurringExpenseCount: number;
}

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
  const datedTransactions = transactions.filter(
    (transaction) => transaction.date !== null,
  );

  if (datedTransactions.length === 0) {
    return null;
  }

  const sortedTransactions = [...datedTransactions].sort(
    (a, b) => a.date!.localeCompare(b.date!),
  );

  const latestTransaction =
    sortedTransactions[sortedTransactions.length - 1];

  return latestTransaction?.balance ?? null;
}

export function generateCashFlowForecast(
  recurringTransactions: RecurringTransaction[],
  startingBalance: number,
  forecastMonths = 3,
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

  let expectedIncome = 0;
  let expectedExpense = 0;

  let recurringIncomeCount = 0;
  let recurringExpenseCount = 0;

  for (const transaction of recurringTransactions) {
    if (transaction.type === "income") {
      expectedIncome += transaction.averageAmount;
      recurringIncomeCount += 1;
    }

    if (transaction.type === "expense") {
      expectedExpense += transaction.averageAmount;
      recurringExpenseCount += 1;
    }
  }

  const expectedNetCashFlow =
    expectedIncome - expectedExpense;

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

    projectedBalance =
      monthStartingBalance + expectedNetCashFlow;

    forecasts.push({
      month: formatMonth(target.year, target.month),

      expectedIncome,
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
): {
  forecasts: MonthlyForecast[];
  cashRisk: CashRiskAnalysis | null;
} {
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
  );

  return {
    forecasts,
    cashRisk: analyzeCashRisk(forecasts),
  };
}
