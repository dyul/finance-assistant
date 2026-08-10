import { classifyTransaction } from "./categoryClassifier";
import {
  normalizeTransactionDate,
  type DateNormalizationOptions,
  type NormalizedDate,
} from "./dateNormalizer";
import {
  hasSignedAmountEvidence,
  isResolvedAmount,
  parseMoney,
  resolveTransactionAmount,
  type AmountSource,
  type AmountStatus,
  type OriginalAmountValues,
} from "./amountNormalizer";

export interface Transaction {
  date: NormalizedDate | null;
  description: string;
  income: number | null;
  expense: number | null;
  amountStatus: AmountStatus;
  amountSource: AmountSource;
  originalAmountValues: OriginalAmountValues;
  balance: number | null;
  category: string;
  categoryName: string;
  confidence: "high" | "medium" | "low";
}

export interface ParsedTransactionResult {
  transactions: Transaction[];
  totalIncome: number;
  totalExpense: number;
  invalidDateCount: number;
  invalidAmountCount: number;
  unknownDirectionCount: number;
  directionConflictCount: number;
  directionOverrideCount: number;
  columnConflictCount: number;
}

export type ResolvedAmountTransaction = Transaction & {
  amountStatus: "valid" | "directionOverride" | "columnConflict";
  income: number;
  expense: number;
};

export function hasResolvedTransactionAmount(
  transaction: Transaction,
): transaction is ResolvedAmountTransaction {
  return (
    transaction.amountStatus === "valid" ||
    transaction.amountStatus === "directionOverride" ||
    transaction.amountStatus === "columnConflict"
  );
}

function parseBalance(value: unknown): number | null {
  const parsed = parseMoney(value);

  return parsed.kind === "valid" ? parsed.value : null;
}

export function parseTransactions(
  rows: Record<string, unknown>[],
  options: DateNormalizationOptions = {},
): ParsedTransactionResult {
  const transactions: Transaction[] = [];

  let totalIncome = 0;
  let totalExpense = 0;
  let invalidDateCount = 0;
  let invalidAmountCount = 0;
  let unknownDirectionCount = 0;
  let directionConflictCount = 0;
  let directionOverrideCount = 0;
  let columnConflictCount = 0;
  const signedAmountEvidence = hasSignedAmountEvidence(rows);

  for (const row of rows) {
    const description = String(row.description ?? "");
    const classification = classifyTransaction(description);

    const date = normalizeTransactionDate(row.date, options);
    const amountResolution = resolveTransactionAmount(
      row,
      signedAmountEvidence,
    );

    if (date === null) {
      invalidDateCount += 1;
    }

    const transaction: Transaction = {
      date,
      description,
      income: amountResolution.income,
      expense: amountResolution.expense,
      amountStatus: amountResolution.amountStatus,
      amountSource: amountResolution.amountSource,
      originalAmountValues: amountResolution.originalAmountValues,
      balance: parseBalance(row.balance),
      category: classification.category,
      categoryName: classification.displayName,
      confidence: classification.confidence,
    };

    if (isResolvedAmount(amountResolution)) {
      totalIncome += amountResolution.income;
      totalExpense += amountResolution.expense;
    }

    if (amountResolution.amountStatus === "invalidAmount") {
      invalidAmountCount += 1;
    } else if (amountResolution.amountStatus === "unknownDirection") {
      unknownDirectionCount += 1;
    } else if (amountResolution.amountStatus === "directionConflict") {
      directionConflictCount += 1;
    } else if (amountResolution.amountStatus === "directionOverride") {
      directionOverrideCount += 1;
    } else if (amountResolution.amountStatus === "columnConflict") {
      columnConflictCount += 1;
    }

    transactions.push(transaction);
  }

  return {
    transactions,
    totalIncome,
    totalExpense,
    invalidDateCount,
    invalidAmountCount,
    unknownDirectionCount,
    directionConflictCount,
    directionOverrideCount,
    columnConflictCount,
  };
}
