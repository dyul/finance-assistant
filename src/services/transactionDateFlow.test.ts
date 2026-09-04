import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { calculateFinancialSummary } from "./financialEngine";
import { getLatestBalance } from "./forecastEngine";
import { mapColumns } from "./columnMapper";
import { aggregateMonthly } from "./monthlyAggregator";
import { aggregateMonthlyExpensesByCategory } from "./monthlyCategoryAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import {
  parseTransactions,
  type Transaction,
} from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";

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

  it("서로 다른 날짜 표현을 표준화한 뒤 실제 월 순서로 집계한다", () => {
    const parsed = parseTransactions([
      { date: "2026/03/01", amount: 300, direction: "입금" },
      { date: "2026-01-15", amount: 100, direction: "입금" },
      { date: "2026년 2월 10일", amount: 200, direction: "입금" },
      { date: "20260401", amount: 400, direction: "입금" },
    ]);

    expect(parsed.transactions.map((transaction) => transaction.date)).toEqual([
      "2026-03-01",
      "2026-01-15",
      "2026-02-10",
      "2026-04-01",
    ]);
    expect(aggregateMonthly(parsed.transactions).map((item) => item.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });

  it("실제 Excel 날짜 셀부터 금액·날짜 집계까지 전체 흐름을 처리한다", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["거래일", "적요", "거래구분", "금액", "잔액"],
        [new Date(2026, 0, 3), "상품판매", "입금", 500_000, 1_500_000],
        ["2026/2/3", "월세", "출금", "700,000", 800_000],
        ["날짜미정", "수수료", "출금", 100_000, 700_000],
        ["2026.03.03", "확인 필요", "입금", "N/A", 700_000],
      ]),
      "거래",
    );
    const workbookData = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const parsedWorkbook = XLSX.read(workbookData, { type: "array" });
    const sheet = parsedWorkbook.Sheets[parsedWorkbook.SheetNames[0]];
    const objectRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      sheet,
      { defval: "" },
    );
    const mappings = mapColumns(Object.keys(objectRows[0]), objectRows);
    const standardizedRows = standardizeTransactionRows(
      objectRows,
      mappings,
    );
    const parsed = parseTransactions(standardizedRows);
    const financialSummary = calculateFinancialSummary(parsed.transactions);
    const monthly = aggregateMonthly(parsed.transactions);

    expect(parsed.transactions[0]?.date).toBe("2026-01-03");
    expect(parsed.invalidDateCount).toBe(1);
    expect(parsed.invalidAmountCount).toBe(1);
    expect(financialSummary).toMatchObject({
      totalIncome: 500_000,
      totalExpense: 800_000,
      netCashFlow: -300_000,
      transactionCount: 4,
      validAmountTransactionCount: 3,
    });
    expect(monthly).toEqual([
      expect.objectContaining({
        month: "2026-01",
        income: 500_000,
        expense: 0,
      }),
      expect.objectContaining({
        month: "2026-02",
        income: 0,
        expense: 700_000,
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
        monthlyAmounts: [
          { month: "2024-01", amount: 10_000 },
          { month: "2024-02", amount: 10_000 },
        ],
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

  it("동일 날짜의 explicit time으로 정방향과 역방향 정렬에서 같은 최신 잔액을 찾는다", () => {
    const forwardRows = [
      { date: "2026-09-03 13:35:10", balance: 900_000 },
      { date: "2026-09-03 13:35:42", balance: 1_100_000 },
    ];
    const forward = parseTransactions(forwardRows).transactions;
    const reverse = parseTransactions([...forwardRows].reverse()).transactions;

    expect(forward.map((transaction) => transaction.time)).toEqual([
      "13:35:10",
      "13:35:42",
    ]);
    expect(getLatestBalance(forward)).toBe(1_100_000);
    expect(getLatestBalance(reverse)).toBe(1_100_000);
  });

  it("다른 날짜를 먼저 비교하고 자정도 explicit time으로 처리한다", () => {
    const transactions = parseTransactions([
      { date: "2026-09-03 23:59", balance: 900_000 },
      { date: "2026-09-04 00:00", balance: 1_000_000 },
      { date: "2026-09-04 00:01", balance: 1_050_000 },
    ]).transactions;

    expect(getLatestBalance(transactions)).toBe(1_050_000);
  });

  it("시간이 하나라도 없으면 기존 source row 순서를 tie-break로 유지한다", () => {
    const dateOnlyLast = parseTransactions([
      { date: "2026-09-03 13:35", balance: 1_100_000 },
      { date: "2026-09-03", balance: 950_000 },
    ]).transactions;
    const timedLast = parseTransactions([
      { date: "2026-09-03", balance: 950_000 },
      { date: "2026-09-03 09:10", balance: 900_000 },
    ]).transactions;

    expect(dateOnlyLast[1]).not.toHaveProperty("time");
    expect(getLatestBalance(dateOnlyLast)).toBe(950_000);
    expect(getLatestBalance(timedLast)).toBe(900_000);
  });

  it("exact timestamp는 기존 source row 순서를 따르고 최신 valid 잔액만 사용한다", () => {
    const exactTimestamp = parseTransactions([
      { date: "2026-09-03 13:35", balance: 1_000_000 },
      { date: "2026-09-03 13:35", balance: 1_100_000 },
    ]).transactions;
    const latestBalanceMissing = parseTransactions([
      { date: "2026-09-03 13:35", balance: 1_100_000 },
      { date: "2026-09-03 14:00", balance: "" },
    ]).transactions;

    expect(getLatestBalance(exactTimestamp)).toBe(1_100_000);
    expect(getLatestBalance(latestBalanceMissing)).toBe(1_100_000);
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
