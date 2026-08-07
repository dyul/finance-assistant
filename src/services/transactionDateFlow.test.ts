import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { calculateFinancialSummary } from "./financialEngine";
import { getLatestBalance } from "./forecastEngine";
import { aggregateMonthly } from "./monthlyAggregator";
import { aggregateMonthlyExpensesByCategory } from "./monthlyCategoryAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import {
  parseTransactions,
  type Transaction,
} from "./transactionParser";

function createTransaction(
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    date: "2024-01-01",
    description: "테스트 거래",
    income: 0,
    expense: 0,
    amountStatus: "valid",
    amountSource: "separate",
    originalAmountValues: {
      income: "0",
      expense: "0",
      amount: null,
      direction: null,
    },
    balance: 0,
    category: "other",
    categoryName: "기타",
    confidence: "low",
    ...overrides,
  };
}

describe("거래 날짜 처리 흐름", () => {
  it("날짜 오류 거래를 전체 합계에는 유지한다", () => {
    const parsed = parseTransactions([
      {
        date: "2024-01-01",
        description: "입금",
        income: 1000,
        expense: 0,
        balance: 1000,
      },
      {
        date: "잘못된 날짜",
        description: "출금",
        income: 0,
        expense: 300,
        balance: 700,
      },
    ]);
    const summary = calculateFinancialSummary(parsed.transactions);
    const monthly = aggregateMonthly(parsed.transactions);

    expect(parsed.transactions[1]?.date).toBeNull();
    expect(parsed.invalidDateCount).toBe(1);
    expect(summary).toMatchObject({
      totalIncome: 1000,
      totalExpense: 300,
      transactionCount: 2,
    });
    expect(monthly).toHaveLength(1);
    expect(monthly[0]).toMatchObject({
      month: "2024-01",
      income: 1000,
      expense: 0,
      transactionCount: 1,
    });
  });

  it("1904 날짜 체계 옵션을 파서까지 전달한다", () => {
    const parsed = parseTransactions(
      [
        {
          date: 1,
          description: "1904 날짜 거래",
          balance: 100,
        },
      ],
      { date1904: true },
    );

    expect(parsed.transactions[0]?.date).toBe("1904-01-02");
    expect(parsed.invalidDateCount).toBe(0);
  });

  it.each(["xlsx", "xls"] as const)(
    "%s 통합 문서의 1904 날짜 설정과 숫자 셀을 읽는다",
    (bookType) => {
      const workbook = XLSX.utils.book_new();
      workbook.Workbook = {
        WBProps: {
          date1904: true,
        },
      };

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["date", "description", "balance"],
          [1, "날짜 테스트", 100],
        ]),
        "거래",
      );

      const workbookData = XLSX.write(workbook, {
        bookType,
        type: "array",
      });
      const parsedWorkbook = XLSX.read(workbookData, {
        type: "array",
      });
      const firstSheet =
        parsedWorkbook.Sheets[parsedWorkbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        firstSheet,
        { defval: "" },
      );
      const parsed = parseTransactions(rows, {
        date1904:
          parsedWorkbook.Workbook?.WBProps?.date1904 === true,
      });

      expect(parsed.transactions[0]?.date).toBe("1904-01-02");
      expect(parsed.invalidDateCount).toBe(0);
    },
  );

  it("날짜 오류 거래를 월별 카테고리 집계에서 제외한다", () => {
    const transactions = [
      createTransaction({ date: null, expense: 300 }),
      createTransaction({ date: "2024-01-02", expense: 500 }),
    ];

    expect(aggregateMonthlyExpensesByCategory(transactions)).toEqual([
      expect.objectContaining({
        month: "2024-01",
        amount: 500,
        transactionCount: 1,
      }),
    ]);
  });

  it("날짜 오류 거래를 반복 거래 감지에서 제외한다", () => {
    const transactions = [
      createTransaction({
        date: "2024-01-02",
        description: "정기 구독",
        expense: 10_000,
      }),
      createTransaction({
        date: "2024-02-02",
        description: "정기 구독",
        expense: 10_000,
      }),
      createTransaction({
        date: null,
        description: "정기 구독",
        expense: 10_000,
      }),
    ];

    expect(detectRecurringTransactions(transactions)).toEqual([
      expect.objectContaining({
        description: "정기 구독",
        occurrenceCount: 2,
        activeMonthCount: 2,
        firstMonth: "2024-01",
        lastMonth: "2024-02",
      }),
    ]);
  });

  it("최신 날짜의 잔액과 실제 0원을 구분한다", () => {
    const transactions = [
      createTransaction({ date: "2024-03-01", balance: 500 }),
      createTransaction({ date: "2024-01-01", balance: 100 }),
      createTransaction({ date: null, balance: 9999 }),
      createTransaction({ date: "2024-03-01", balance: 0 }),
    ];

    expect(getLatestBalance(transactions)).toBe(0);
  });

  it("유효한 날짜 거래가 없으면 최신 잔액을 null로 반환한다", () => {
    expect(
      getLatestBalance([
        createTransaction({ date: null, balance: 500 }),
      ]),
    ).toBeNull();
    expect(getLatestBalance([])).toBeNull();
  });
});
