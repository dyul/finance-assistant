import type { NormalizedDate } from "./dateNormalizer";
import { createRecurringTransactionKey } from "./recurringTransactionDetector";
import type { ScheduledTransaction } from "./scheduledTransaction";
import { isFutureDatedTransaction } from "./transactionDateScope";
import type { Transaction } from "./transactionParser";

export interface FutureSourceTransaction {
  id: string;
  sourceIndex: number;
  date: NormalizedDate;
  description: string;
  category: string;
  type: "income" | "expense";
  amount: number;
  recurringKey: string;
}

export interface FutureSourceForecastScope {
  included: FutureSourceTransaction[];
  excluded: FutureSourceTransaction[];
  outOfHorizon: FutureSourceTransaction[];
  includedIncome: number;
  includedExpense: number;
}

export type FutureSourceSelectionAction =
  | { type: "newFile" }
  | { type: "fileSettingsReset" }
  | { type: "sameFileReanalyzed"; availableIds: string[] }
  | { type: "setIncluded"; id: string; included: boolean };

export function futureSourceSelectionReducer(
  state: string[],
  action: FutureSourceSelectionAction,
): string[] {
  if (action.type === "newFile" || action.type === "fileSettingsReset") {
    return [];
  }

  if (action.type === "sameFileReanalyzed") {
    const availableIdSet = new Set(action.availableIds);
    return state.filter((id) => availableIdSet.has(id));
  }

  if (action.type !== "setIncluded") {
    return state;
  }

  if (action.included) {
    return state.filter((id) => id !== action.id);
  }

  return state.includes(action.id) ? state : [...state, action.id];
}

function resolveFutureTransactionDirection(
  transaction: Transaction,
): { type: "income" | "expense"; amount: number } | null {
  if (
    transaction.amountStatus !== "valid" ||
    transaction.income === null ||
    transaction.expense === null
  ) {
    return null;
  }

  if (transaction.income > 0 && transaction.expense === 0) {
    return { type: "income", amount: transaction.income };
  }

  if (transaction.expense > 0 && transaction.income === 0) {
    return { type: "expense", amount: transaction.expense };
  }

  return null;
}

export function createFutureSourceTransactions(
  transactions: Transaction[],
  referenceDate: NormalizedDate,
): FutureSourceTransaction[] {
  return transactions.flatMap((transaction, sourceIndex) => {
    if (
      transaction.date === null ||
      !isFutureDatedTransaction(transaction, referenceDate)
    ) {
      return [];
    }

    const direction = resolveFutureTransactionDirection(transaction);

    if (!direction) {
      return [];
    }

    const recurringKey = createRecurringTransactionKey({
      description: transaction.description,
      category: transaction.category,
      type: direction.type,
    });

    return [
      {
        id: `future-source-${sourceIndex}-${transaction.date}-${direction.type}`,
        sourceIndex,
        date: transaction.date,
        description: transaction.description,
        category: transaction.category,
        type: direction.type,
        amount: direction.amount,
        recurringKey,
      },
    ];
  });
}

export function partitionFutureSourceTransactionsByForecastMonths(
  transactions: FutureSourceTransaction[],
  forecastMonths: string[],
  excludedIds: ReadonlySet<string>,
): FutureSourceForecastScope {
  const forecastMonthSet = new Set(forecastMonths);
  const included: FutureSourceTransaction[] = [];
  const excluded: FutureSourceTransaction[] = [];
  const outOfHorizon: FutureSourceTransaction[] = [];
  let includedIncome = 0;
  let includedExpense = 0;

  for (const transaction of transactions) {
    if (!forecastMonthSet.has(transaction.date.slice(0, 7))) {
      outOfHorizon.push(transaction);
      continue;
    }

    if (excludedIds.has(transaction.id)) {
      excluded.push(transaction);
      continue;
    }

    included.push(transaction);

    if (transaction.type === "income") {
      includedIncome += transaction.amount;
    } else {
      includedExpense += transaction.amount;
    }
  }

  return {
    included,
    excluded,
    outOfHorizon,
    includedIncome,
    includedExpense,
  };
}

export function toFileScheduledTransactions(
  transactions: FutureSourceTransaction[],
): ScheduledTransaction[] {
  return transactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    type: transaction.type,
    amount: transaction.amount,
    source: "file",
    recurringKey: transaction.recurringKey,
  }));
}
