import type { NormalizedDate } from "./dateNormalizer";
import type { Transaction } from "./transactionParser";

export interface TransactionChronologyCandidate {
  transaction: Transaction;
  sourceOrder: number;
}

export type TransactionChronologyComparator = (
  first: TransactionChronologyCandidate,
  second: TransactionChronologyCandidate,
) => number;

function getFullyTimedDates(
  candidates: TransactionChronologyCandidate[],
): ReadonlySet<NormalizedDate> {
  const allCandidatesHaveTime = new Map<NormalizedDate, boolean>();

  for (const { transaction } of candidates) {
    if (transaction.date === null) {
      continue;
    }

    const previous = allCandidatesHaveTime.get(transaction.date) ?? true;
    allCandidatesHaveTime.set(
      transaction.date,
      previous && transaction.time !== undefined,
    );
  }

  return new Set(
    [...allCandidatesHaveTime.entries()]
      .filter(([, allHaveTime]) => allHaveTime)
      .map(([date]) => date),
  );
}

export function createTransactionChronologyCandidates(
  transactions: Transaction[],
): TransactionChronologyCandidate[] {
  return transactions.map((transaction, iterationOrder) => ({
    transaction,
    sourceOrder: transaction.sourceRowIndex ?? iterationOrder,
  }));
}

export function createTransactionChronologyComparator(
  candidates: TransactionChronologyCandidate[],
): TransactionChronologyComparator {
  const fullyTimedDates = getFullyTimedDates(candidates);

  return (first, second) => {
    const firstTransaction = first.transaction;
    const secondTransaction = second.transaction;

    if (firstTransaction.date !== secondTransaction.date) {
      if (firstTransaction.date === null) {
        return -1;
      }

      if (secondTransaction.date === null) {
        return 1;
      }

      return firstTransaction.date.localeCompare(secondTransaction.date);
    }

    if (
      firstTransaction.date !== null &&
      fullyTimedDates.has(firstTransaction.date) &&
      firstTransaction.time !== undefined &&
      secondTransaction.time !== undefined
    ) {
      const timeComparison = firstTransaction.time.localeCompare(
        secondTransaction.time,
      );

      if (timeComparison !== 0) {
        return timeComparison;
      }
    }

    return first.sourceOrder - second.sourceOrder;
  };
}
