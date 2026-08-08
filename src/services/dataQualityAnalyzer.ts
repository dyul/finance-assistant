import {
  hasResolvedTransactionAmount,
  type Transaction,
} from "./transactionParser";

export interface DataQualitySummary {
  totalTransactionCount: number;
  amountIncludedCount: number;
  dateAnalysisIncludedCount: number;
  validDateCount: number;
  invalidAmountCount: number;
  invalidDateCount: number;
  directionIssueCount: number;
}

export function analyzeDataQuality(
  transactions: Transaction[],
): DataQualitySummary {
  let amountIncludedCount = 0;
  let dateAnalysisIncludedCount = 0;
  let validDateCount = 0;
  let invalidAmountCount = 0;
  let invalidDateCount = 0;
  let directionIssueCount = 0;

  for (const transaction of transactions) {
    const hasValidDate = transaction.date !== null;
    const hasValidAmount = hasResolvedTransactionAmount(transaction);

    if (hasValidDate) {
      validDateCount += 1;
    } else {
      invalidDateCount += 1;
    }

    if (hasValidAmount) {
      amountIncludedCount += 1;

      if (hasValidDate) {
        dateAnalysisIncludedCount += 1;
      }
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
  }

  return {
    totalTransactionCount: transactions.length,
    amountIncludedCount,
    dateAnalysisIncludedCount,
    validDateCount,
    invalidAmountCount,
    invalidDateCount,
    directionIssueCount,
  };
}
