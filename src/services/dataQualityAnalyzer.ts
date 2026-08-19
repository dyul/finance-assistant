import {
  hasResolvedTransactionAmount,
  type Transaction,
} from "./transactionParser";
import type { NormalizedDate } from "./dateNormalizer";
import { isFutureDatedTransaction } from "./transactionDateScope";

export interface DataQualitySummary {
  totalTransactionCount: number;
  historicalTransactionCount: number;
  amountIncludedCount: number;
  dateAnalysisIncludedCount: number;
  validDateCount: number;
  invalidAmountCount: number;
  invalidDateCount: number;
  directionIssueCount: number;
  futureDatedTransactionCount: number;
  futureDatedIncome: number;
  futureDatedExpense: number;
}

export function analyzeDataQuality(
  transactions: Transaction[],
  options: { referenceDate?: NormalizedDate } = {},
): DataQualitySummary {
  let historicalTransactionCount = 0;
  let amountIncludedCount = 0;
  let dateAnalysisIncludedCount = 0;
  let validDateCount = 0;
  let invalidAmountCount = 0;
  let invalidDateCount = 0;
  let directionIssueCount = 0;
  let futureDatedTransactionCount = 0;
  let futureDatedIncome = 0;
  let futureDatedExpense = 0;

  for (const transaction of transactions) {
    const hasValidDate = transaction.date !== null;
    const hasValidAmount = hasResolvedTransactionAmount(transaction);
    const isFutureDated =
      options.referenceDate !== undefined &&
      isFutureDatedTransaction(transaction, options.referenceDate);

    if (hasValidDate) {
      validDateCount += 1;
    } else {
      invalidDateCount += 1;
    }

    if (transaction.amountStatus === "invalidAmount") {
      invalidAmountCount += 1;
    }

    if (
      transaction.amountStatus === "unknownDirection" ||
      transaction.amountStatus === "directionConflict" ||
      transaction.amountStatus === "directionOverride"
    ) {
      directionIssueCount += 1;
    }

    if (isFutureDated) {
      futureDatedTransactionCount += 1;

      if (hasValidAmount) {
        futureDatedIncome += transaction.income;
        futureDatedExpense += transaction.expense;
      }

      continue;
    }

    historicalTransactionCount += 1;

    if (hasValidAmount) {
      amountIncludedCount += 1;

      if (hasValidDate) {
        dateAnalysisIncludedCount += 1;
      }
    }
  }

  return {
    totalTransactionCount: transactions.length,
    historicalTransactionCount,
    amountIncludedCount,
    dateAnalysisIncludedCount,
    validDateCount,
    invalidAmountCount,
    invalidDateCount,
    directionIssueCount,
    futureDatedTransactionCount,
    futureDatedIncome,
    futureDatedExpense,
  };
}
