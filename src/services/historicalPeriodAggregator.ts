import type { NormalizedDate } from "./dateNormalizer";
import {
  hasResolvedTransactionAmount,
  type Transaction,
} from "./transactionParser";
import {
  createTransactionChronologyCandidates,
  createTransactionChronologyComparator,
  type TransactionChronologyCandidate,
  type TransactionChronologyComparator,
} from "./transactionChronology";

export type HistoricalPeriodUnit = "monthly" | "quarterly" | "yearly";

export interface HistoricalPeriodTopExpense {
  category: string;
  categoryName: string;
  amount: number;
  shareOfPeriodExpense: number;
}

export interface HistoricalPeriodSummary {
  periodKey: string;
  label: string;
  startDate: NormalizedDate;
  endDate: NormalizedDate;
  transactionCount: number;
  income: number;
  expense: number;
  netCashFlow: number;
  closingBalance: number | null;
  topExpense: HistoricalPeriodTopExpense | null;
}

export interface HistoricalPeriodAggregation {
  monthly: HistoricalPeriodSummary[];
  quarterly: HistoricalPeriodSummary[];
  yearly: HistoricalPeriodSummary[];
  excludedInvalidDateCount: number;
  excludedInvalidDateIncome: number;
  excludedInvalidDateExpense: number;
}

interface PeriodDescriptor {
  periodKey: string;
  label: string;
  startDate: NormalizedDate;
  endDate: NormalizedDate;
}

interface CategoryAccumulator {
  category: string;
  categoryName: string;
  amount: number;
}

interface PeriodAccumulator extends PeriodDescriptor {
  transactionCount: number;
  income: number;
  expense: number;
  closingBalance: number | null;
  closingBalanceCandidate: TransactionChronologyCandidate | null;
  expenseCategories: Map<string, CategoryAccumulator>;
}

function formatDate(year: number, month: number, day: number): NormalizedDate {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` as NormalizedDate;
}

function getLastDayOfMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function getPeriodDescriptor(
  date: NormalizedDate,
  unit: HistoricalPeriodUnit,
): PeriodDescriptor {
  const [yearText, monthText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (unit === "monthly") {
    const periodKey = `${yearText}-${monthText}`;
    return {
      periodKey,
      label: `${year}년 ${month}월`,
      startDate: formatDate(year, month, 1),
      endDate: formatDate(year, month, getLastDayOfMonth(year, month)),
    };
  }

  if (unit === "quarterly") {
    const quarter = Math.floor((month - 1) / 3) + 1;
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    return {
      periodKey: `${year}-Q${quarter}`,
      label: `${year}년 ${quarter}분기`,
      startDate: formatDate(year, startMonth, 1),
      endDate: formatDate(
        year,
        endMonth,
        getLastDayOfMonth(year, endMonth),
      ),
    };
  }

  return {
    periodKey: String(year),
    label: `${year}년`,
    startDate: formatDate(year, 1, 1),
    endDate: formatDate(year, 12, 31),
  };
}

function getOrCreateAccumulator(
  periodMap: Map<string, PeriodAccumulator>,
  descriptor: PeriodDescriptor,
): PeriodAccumulator {
  const existing = periodMap.get(descriptor.periodKey);
  if (existing) {
    return existing;
  }

  const created: PeriodAccumulator = {
    ...descriptor,
    transactionCount: 0,
    income: 0,
    expense: 0,
    closingBalance: null,
    closingBalanceCandidate: null,
    expenseCategories: new Map(),
  };
  periodMap.set(descriptor.periodKey, created);
  return created;
}

function addTransactionToPeriod(
  accumulator: PeriodAccumulator,
  candidate: TransactionChronologyCandidate,
  compareChronology: TransactionChronologyComparator,
): void {
  const { transaction } = candidate;

  if (transaction.date === null) {
    return;
  }

  if (
    transaction.balance !== null &&
    (accumulator.closingBalanceCandidate === null ||
      compareChronology(candidate, accumulator.closingBalanceCandidate) >= 0)
  ) {
    accumulator.closingBalanceCandidate = candidate;
    accumulator.closingBalance = transaction.balance;
  }

  if (!hasResolvedTransactionAmount(transaction)) {
    return;
  }

  accumulator.transactionCount += 1;
  accumulator.income += transaction.income;
  accumulator.expense += transaction.expense;

  if (transaction.expense <= 0) {
    return;
  }

  const existingCategory = accumulator.expenseCategories.get(
    transaction.category,
  );
  if (existingCategory) {
    existingCategory.amount += transaction.expense;
    return;
  }

  accumulator.expenseCategories.set(transaction.category, {
    category: transaction.category,
    categoryName: transaction.categoryName,
    amount: transaction.expense,
  });
}

function toSummary(accumulator: PeriodAccumulator): HistoricalPeriodSummary {
  const topCategory = Array.from(accumulator.expenseCategories.values()).sort(
    (first, second) => second.amount - first.amount,
  )[0];

  return {
    periodKey: accumulator.periodKey,
    label: accumulator.label,
    startDate: accumulator.startDate,
    endDate: accumulator.endDate,
    transactionCount: accumulator.transactionCount,
    income: accumulator.income,
    expense: accumulator.expense,
    netCashFlow: accumulator.income - accumulator.expense,
    closingBalance: accumulator.closingBalance,
    topExpense: topCategory
      ? {
          category: topCategory.category,
          categoryName: topCategory.categoryName,
          amount: topCategory.amount,
          shareOfPeriodExpense:
            accumulator.expense > 0
              ? (topCategory.amount / accumulator.expense) * 100
              : 0,
        }
      : null,
  };
}

function finalizePeriodMap(
  periodMap: Map<string, PeriodAccumulator>,
): HistoricalPeriodSummary[] {
  return Array.from(periodMap.values())
    .map(toSummary)
    .sort((first, second) => first.periodKey.localeCompare(second.periodKey));
}

export function aggregateHistoricalPeriods(
  historicalTransactions: Transaction[],
): HistoricalPeriodAggregation {
  const periodMaps: Record<
    HistoricalPeriodUnit,
    Map<string, PeriodAccumulator>
  > = {
    monthly: new Map(),
    quarterly: new Map(),
    yearly: new Map(),
  };
  let excludedInvalidDateCount = 0;
  let excludedInvalidDateIncome = 0;
  let excludedInvalidDateExpense = 0;
  const candidates = createTransactionChronologyCandidates(
    historicalTransactions,
  );
  const balanceCandidates = candidates.filter(
    ({ transaction }) =>
      transaction.date !== null && transaction.balance !== null,
  );
  const compareBalanceChronology =
    createTransactionChronologyComparator(balanceCandidates);

  for (const candidate of candidates) {
    const { transaction } = candidate;

    if (transaction.date === null) {
      if (hasResolvedTransactionAmount(transaction)) {
        excludedInvalidDateCount += 1;
        excludedInvalidDateIncome += transaction.income;
        excludedInvalidDateExpense += transaction.expense;
      }
      continue;
    }

    if (
      !hasResolvedTransactionAmount(transaction) &&
      transaction.balance === null
    ) {
      continue;
    }

    for (const unit of ["monthly", "quarterly", "yearly"] as const) {
      const descriptor = getPeriodDescriptor(transaction.date, unit);
      const accumulator = getOrCreateAccumulator(periodMaps[unit], descriptor);
      addTransactionToPeriod(
        accumulator,
        candidate,
        compareBalanceChronology,
      );
    }
  }

  return {
    monthly: finalizePeriodMap(periodMaps.monthly),
    quarterly: finalizePeriodMap(periodMaps.quarterly),
    yearly: finalizePeriodMap(periodMaps.yearly),
    excludedInvalidDateCount,
    excludedInvalidDateIncome,
    excludedInvalidDateExpense,
  };
}

export function isHistoricalPeriodInProgress(
  summary: HistoricalPeriodSummary,
  referenceDate: NormalizedDate,
): boolean {
  return referenceDate >= summary.startDate && referenceDate <= summary.endDate;
}
