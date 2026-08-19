import type { NormalizedDate } from "./dateNormalizer";
import {
  hasResolvedTransactionAmount,
  type Transaction,
} from "./transactionParser";

export interface TransactionDateScope {
  historicalTransactions: Transaction[];
  futureDatedTransactions: Transaction[];
  futureDatedIncome: number;
  futureDatedExpense: number;
}

export function getLocalDateKey(date = new Date()): NormalizedDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as NormalizedDate;
}

export function isFutureDatedTransaction(
  transaction: Transaction,
  referenceDate: NormalizedDate,
): boolean {
  return transaction.date !== null && transaction.date > referenceDate;
}

export function partitionTransactionsByReferenceDate(
  transactions: Transaction[],
  referenceDate: NormalizedDate,
): TransactionDateScope {
  const historicalTransactions: Transaction[] = [];
  const futureDatedTransactions: Transaction[] = [];
  let futureDatedIncome = 0;
  let futureDatedExpense = 0;

  for (const transaction of transactions) {
    if (!isFutureDatedTransaction(transaction, referenceDate)) {
      historicalTransactions.push(transaction);
      continue;
    }

    futureDatedTransactions.push(transaction);

    if (hasResolvedTransactionAmount(transaction)) {
      futureDatedIncome += transaction.income;
      futureDatedExpense += transaction.expense;
    }
  }

  return {
    historicalTransactions,
    futureDatedTransactions,
    futureDatedIncome,
    futureDatedExpense,
  };
}
