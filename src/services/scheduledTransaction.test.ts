import { describe, expect, it } from "vitest";

import {
  partitionScheduledTransactionsByForecastMonths,
  type ScheduledTransaction,
} from "./scheduledTransaction";

describe("저장된 예정거래의 현재 Forecast 적용 범위", () => {
  it("기간 안 거래만 계산 대상으로 분리하고 나머지는 보존한다", () => {
    const transactions: ScheduledTransaction[] = [
      {
        id: "current",
        date: "2026-05-10",
        description: "현재 기간 입금",
        type: "income",
        amount: 500_000,
      },
      {
        id: "previous-file",
        date: "2027-05-10",
        description: "다른 기간 입금",
        type: "income",
        amount: 300_000,
      },
      {
        id: "invalid-date",
        date: "날짜 확인 필요",
        description: "날짜 오류 거래",
        type: "expense",
        amount: 100_000,
      },
    ];

    expect(
      partitionScheduledTransactionsByForecastMonths(transactions, [
        "2026-04",
        "2026-05",
        "2026-06",
      ]),
    ).toEqual({
      applicable: [transactions[0]],
      outOfPeriod: [transactions[1], transactions[2]],
    });
  });
});
