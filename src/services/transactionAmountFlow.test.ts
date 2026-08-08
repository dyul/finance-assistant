import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { aggregateExpensesByCategory } from "./categoryAggregator";
import { mapColumns } from "./columnMapper";
import { calculateFinancialSummary } from "./financialEngine";
import { getLatestBalance } from "./forecastEngine";
import { aggregateMonthly } from "./monthlyAggregator";
import { aggregateMonthlyExpensesByCategory } from "./monthlyCategoryAggregator";
import { detectRecurringTransactions } from "./recurringTransactionDetector";
import { parseTransactions } from "./transactionParser";
import { standardizeTransactionRows } from "./transactionRowStandardizer";

describe("단일 금액 거래 처리 흐름", () => {
  it("기존 분리 입금·출금 구조의 결과를 유지한다", () => {
    const parsed = parseTransactions([
      { date: "2024-01-01", description: "입금", income: "1,000", expense: 0 },
      { date: "2024-01-02", description: "출금", income: 0, expense: 300 },
    ]);

    expect(parsed.transactions).toEqual([
      expect.objectContaining({
        amountStatus: "valid",
        amountSource: "separate",
        income: 1000,
        expense: 0,
      }),
      expect.objectContaining({
        amountStatus: "valid",
        amountSource: "separate",
        income: 0,
        expense: 300,
      }),
    ]);
    expect(parsed).toMatchObject({
      totalIncome: 1000,
      totalExpense: 300,
      invalidAmountCount: 0,
      unknownDirectionCount: 0,
      directionConflictCount: 0,
      directionOverrideCount: 0,
      columnConflictCount: 0,
    });
  });

  it("단일 금액과 방향 컬럼을 입금·출금으로 변환한다", () => {
    const parsed = parseTransactions([
      { amount: 1000, direction: "입금" },
      { amount: 300, direction: "출금" },
    ]);

    expect(parsed.transactions).toEqual([
      expect.objectContaining({ income: 1000, expense: 0 }),
      expect.objectContaining({ income: 0, expense: 300 }),
    ]);
  });

  it("명시 방향과 부호가 다르면 방향을 적용하고 경고 상태를 집계한다", () => {
    const parsed = parseTransactions([
      { amount: "+1,000", direction: "출금" },
      { amount: -500, direction: "입금" },
    ]);

    expect(parsed.transactions).toEqual([
      expect.objectContaining({
        amountStatus: "directionOverride",
        income: 0,
        expense: 1000,
      }),
      expect.objectContaining({
        amountStatus: "directionOverride",
        income: 500,
        expense: 0,
      }),
    ]);
    expect(parsed.directionOverrideCount).toBe(2);
    expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
      totalIncome: 500,
      totalExpense: 1000,
      netCashFlow: -500,
    });
  });

  it.each(["xlsx", "xls"] as const)(
    "%s 단일 금액 파일을 컬럼 매핑부터 파싱한다",
    (bookType) => {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["거래일", "적요", "거래구분", "금액", "잔액"],
          ["2024-01-01", "상품판매",  "입금", 500000, 1500000],
          ["2024-01-02", "월세", "출금", 700000, 800000],
        ]),
        "거래",
      );
      const workbookData = XLSX.write(workbook, {
        bookType,
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
      const summary = calculateFinancialSummary(parsed.transactions);

      expect(parsed.transactions).toEqual([
        expect.objectContaining({ income: 500000, expense: 0 }),
        expect.objectContaining({ income: 0, expense: 700000 }),
      ]);
      expect(summary).toMatchObject({
        totalIncome: 500000,
        totalExpense: 700000,
        netCashFlow: -200000,
      });
    },
  );

  it("적격한 음수가 있으면 같은 컬럼의 양수를 입금으로 해석한다", () => {
    const parsed = parseTransactions([
      { amount: -300 },
      { amount: 1000 },
    ]);

    expect(parsed.transactions).toEqual([
      expect.objectContaining({ income: 0, expense: 300 }),
      expect.objectContaining({ income: 1000, expense: 0 }),
    ]);
  });

  it("행별 분리 컬럼을 우선하고 빈 행만 단일 금액으로 보완한다", () => {
    const parsed = parseTransactions([
      { income: 500, expense: 0, amount: -900 },
      { income: "", expense: "", amount: -300 },
    ]);

    expect(parsed.transactions[0]).toMatchObject({
      amountStatus: "columnConflict",
      income: 500,
      expense: 0,
    });
    expect(parsed.transactions[1]).toMatchObject({
      amountStatus: "valid",
      income: 0,
      expense: 300,
    });
    expect(parsed.columnConflictCount).toBe(1);
    expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
      totalIncome: 500,
      totalExpense: 300,
      validAmountTransactionCount: 2,
    });
  });

  it("오류 상태를 행마다 하나만 집계한다", () => {
    const parsed = parseTransactions([
      { amount: "잘못된 값", direction: "알 수 없음" },
      { amount: 100, direction: "알 수 없음" },
      { amount: -100, direction: "입금" },
      { income: 50, expense: 30, amount: -999 },
    ]);

    expect(parsed).toMatchObject({
      invalidAmountCount: 1,
      unknownDirectionCount: 1,
      directionConflictCount: 1,
      directionOverrideCount: 1,
      columnConflictCount: 0,
    });
  });

  it("오류 거래는 전체 건수에만 포함하고 정상 0원은 유효 건수에 포함한다", () => {
    const parsed = parseTransactions([
      { date: "2024-01-01", amount: 0 },
      { date: "2024-01-02", amount: "잘못된 값" },
      { date: "2024-01-03", amount: 500 },
      { date: "2024-01-04", amount: "+100" },
    ]);
    const summary = calculateFinancialSummary(parsed.transactions);
    const monthly = aggregateMonthly(parsed.transactions);

    expect(summary).toMatchObject({
      transactionCount: 4,
      validAmountTransactionCount: 3,
      totalIncome: 600,
      totalExpense: 0,
      averageTransactionAmount: 200,
    });
    expect(monthly[0]).toMatchObject({
      income: 600,
      expense: 0,
      transactionCount: 3,
    });
  });

  it("금액 오류 거래를 카테고리와 반복 거래 분석에서 제외한다", () => {
    const parsed = parseTransactions([
      {
        date: "2024-01-01",
        description: "정기 구독",
        amount: 10_000,
        direction: "출금",
      },
      {
        date: "2024-02-01",
        description: "정기 구독",
        amount: 10_000,
        direction: "출금",
      },
      {
        date: "2024-03-01",
        description: "정기 구독",
        amount: "오류",
      },
    ]);

    expect(aggregateExpensesByCategory(parsed.transactions)[0]).toMatchObject({
      amount: 20_000,
      transactionCount: 2,
    });
    expect(
      aggregateMonthlyExpensesByCategory(parsed.transactions),
    ).toHaveLength(2);
    expect(detectRecurringTransactions(parsed.transactions)[0]).toMatchObject({
      occurrenceCount: 2,
      activeMonthCount: 2,
    });
  });

  it("날짜 오류와 금액 오류를 독립적으로 집계한다", () => {
    const parsed = parseTransactions([
      { date: "잘못된 날짜", amount: "잘못된 금액", balance: 100 },
    ]);

    expect(parsed.invalidDateCount).toBe(1);
    expect(parsed.invalidAmountCount).toBe(1);
  });

  it("해석 불가능한 금액과 실제 0원을 구분해 합계를 보호한다", () => {
    const parsed = parseTransactions([
      { amount: "금액미정" },
      { amount: "N/A" },
      { amount: 0 },
    ]);

    expect(parsed.invalidAmountCount).toBe(2);
    expect(parsed.transactions[0]).toMatchObject({
      amountStatus: "invalidAmount",
      income: null,
      expense: null,
    });
    expect(parsed.transactions[1]).toMatchObject({
      amountStatus: "invalidAmount",
      income: null,
      expense: null,
    });
    expect(parsed.transactions[2]).toMatchObject({
      amountStatus: "valid",
      income: 0,
      expense: 0,
    });
    expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
      totalIncome: 0,
      totalExpense: 0,
      validAmountTransactionCount: 1,
    });
  });

  it("금액 오류 거래도 유효한 날짜가 있으면 최신 잔액 후보로 유지한다", () => {
    const parsed = parseTransactions([
      { date: "2024-01-01", amount: "+100", balance: 100 },
      { date: "2024-02-01", amount: "오류", balance: 900 },
    ]);

    expect(getLatestBalance(parsed.transactions)).toBe(900);
  });
});
