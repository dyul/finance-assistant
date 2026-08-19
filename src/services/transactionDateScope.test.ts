import { describe, expect, it } from "vitest";

import {
  getLocalDateKey,
  partitionTransactionsByReferenceDate,
} from "./transactionDateScope";
import { parseTransactions } from "./transactionParser";

describe("원본 거래의 오늘 기준 날짜 범위", () => {
  it("UTC 변환 없이 사용자 환경의 로컬 날짜 키를 만든다", () => {
    expect(getLocalDateKey(new Date(2026, 7, 19, 23, 59, 59))).toBe(
      "2026-08-19",
    );
  });

  it("오늘과 잘못된 날짜는 유지하고 오늘보다 뒤인 거래만 분리한다", () => {
    const parsed = parseTransactions([
      { date: "2026-08-19", amount: 100_000, direction: "수입" },
      { date: "날짜미정", amount: 20_000, direction: "지출" },
      { date: "2026-08-20", amount: 30_000, direction: "지출" },
    ]);
    const scope = partitionTransactionsByReferenceDate(
      parsed.transactions,
      "2026-08-19",
    );

    expect(scope.historicalTransactions).toHaveLength(2);
    expect(scope.futureDatedTransactions).toHaveLength(1);
    expect(scope.futureDatedIncome).toBe(0);
    expect(scope.futureDatedExpense).toBe(30_000);
  });
});
