import type { NormalizedDate } from "../services/dateNormalizer";
import { isFutureDatedTransaction } from "../services/transactionDateScope";
import type { Transaction } from "../services/transactionParser";

export const TRANSACTION_DISPLAY_PAGE_SIZE = 50;

export function getExpandedTransactionLimit(
  currentLimit: number,
  totalCount: number,
): number {
  return Math.min(
    totalCount,
    currentLimit + TRANSACTION_DISPLAY_PAGE_SIZE,
  );
}

function transactionNeedsReview(
  transaction: Transaction,
  referenceDate: NormalizedDate,
): boolean {
  return (
    transaction.date === null ||
    transaction.amountStatus !== "valid" ||
    isFutureDatedTransaction(transaction, referenceDate)
  );
}

export function getVisibleTransactionRows(
  transactions: Transaction[],
  baseVisibleCount: number,
  referenceDate: NormalizedDate,
): Array<{ transaction: Transaction; sourceIndex: number }> {
  return transactions.flatMap((transaction, sourceIndex) =>
    sourceIndex < baseVisibleCount ||
    transactionNeedsReview(transaction, referenceDate)
      ? [{ transaction, sourceIndex }]
      : [],
  );
}
