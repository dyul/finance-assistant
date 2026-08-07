import type { RecurringTransaction } from "./recurringTransactionDetector";
import type { Transaction } from "./transactionParser";

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

function normalizeDate(date: string): number {
  const normalized = String(date).trim();

  const match = normalized.match(
    /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/,
  );

  if (!match) {
    return 0;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return new Date(year, month - 1, day).getTime();
}

export function getLatestBalance(
  transactions: Transaction[],
): number {
  if (transactions.length === 0) {
    return 0;
  }

  const sortedTransactions = [...transactions].sort(
    (a, b) =>
      normalizeDate(a.date) - normalizeDate(b.date),
  );

  const latestTransaction =
    sortedTransactions[sortedTransactions.length - 1];

  return latestTransaction?.balance ?? 0;
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