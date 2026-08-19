import { describe, expect, it } from "vitest";

import { analyzeDataQuality } from "./dataQualityAnalyzer";
import { parseTransactions } from "./transactionParser";

describe("analyzeDataQuality", () => {
  it("전체·금액 포함·날짜 분석 포함 건수를 서로 구분한다", () => {
    const parsed = parseTransactions([
      {
        date: "2026-01-03",
        amount: 500000,
        direction: "입금",
      },
      {
        date: "날짜미정",
        amount: 700000,
        direction: "출금",
      },
      {
        date: "2026-01-05",
        amount: "금액미정",
        direction: "입금",
      },
      {
        date: "2026-01-06",
        amount: 100000,
        direction: "기타",
      },
      {
        date: "2026-01-07",
        amount: "+50000",
        direction: "출금",
      },
    ]);

    expect(analyzeDataQuality(parsed.transactions)).toEqual({
      totalTransactionCount: 5,
      historicalTransactionCount: 5,
      amountIncludedCount: 3,
      dateAnalysisIncludedCount: 2,
      validDateCount: 4,
      invalidAmountCount: 1,
      invalidDateCount: 1,
      directionIssueCount: 2,
      futureDatedTransactionCount: 0,
      futureDatedIncome: 0,
      futureDatedExpense: 0,
    });
  });

  it("거래가 없으면 모든 건수를 0으로 반환한다", () => {
    expect(analyzeDataQuality([])).toEqual({
      totalTransactionCount: 0,
      historicalTransactionCount: 0,
      amountIncludedCount: 0,
      dateAnalysisIncludedCount: 0,
      validDateCount: 0,
      invalidAmountCount: 0,
      invalidDateCount: 0,
      directionIssueCount: 0,
      futureDatedTransactionCount: 0,
      futureDatedIncome: 0,
      futureDatedExpense: 0,
    });
  });
});
