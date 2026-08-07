import { describe, expect, it } from "vitest";

import {
  hasSignedAmountEvidence,
  parseDirection,
  parseMoney,
  resolveTransactionAmount,
} from "./amountNormalizer";

describe("amountNormalizer", () => {
  it.each([
    [-1000, "negative", -1000],
    ["(1,000)", "negative", -1000],
    ["+1,000", "explicitPositive", 1000],
    [1000, "unsignedPositive", 1000],
    [0, "zero", 0],
  ])("금액 %s의 부호 증거를 구분한다", (input, signEvidence, value) => {
    expect(parseMoney(input)).toEqual({
      kind: "valid",
      signEvidence,
      value,
    });
  });

  it.each([null, undefined, "", " "])("빈 값 %s를 누락으로 구분한다", (input) => {
    expect(parseMoney(input)).toEqual({ kind: "missing" });
  });

  it.each(["1,00", "1원", "abc", Number.NaN, Infinity])(
    "잘못된 금액 %s를 거부한다",
    (input) => {
      expect(parseMoney(input)).toEqual({ kind: "invalid" });
    },
  );

  it.each([
    ["입금", "income"],
    ["수입", "income"],
    ["매출", "income"],
    ["deposit", "income"],
    ["income", "income"],
    ["revenue", "income"],
    ["credit", "income"],
    ["cr", "income"],
    ["in", "income"],
    ["출금", "expense"],
    ["지출", "expense"],
    ["비용", "expense"],
    ["withdrawal", "expense"],
    ["expense", "expense"],
    ["cost", "expense"],
    ["debit", "expense"],
    ["dr", "expense"],
    ["out", "expense"],
  ])("방향값 %s를 %s으로 해석한다", (input, direction) => {
    expect(parseDirection(input)).toEqual({ kind: "valid", direction });
  });

  it("명확한 방향과 부호의 정상 조합을 처리한다", () => {
    expect(
      resolveTransactionAmount({ amount: 1000, direction: "입금" }, false),
    ).toMatchObject({ amountStatus: "valid", income: 1000, expense: 0 });
    expect(
      resolveTransactionAmount({ amount: 1000, direction: "출금" }, false),
    ).toMatchObject({ amountStatus: "valid", income: 0, expense: 1000 });
    expect(
      resolveTransactionAmount({ amount: -1000, direction: "출금" }, false),
    ).toMatchObject({ amountStatus: "valid", income: 0, expense: 1000 });
  });

  it("방향과 부호가 충돌하면 계산에서 제외한다", () => {
    expect(
      resolveTransactionAmount({ amount: -1000, direction: "입금" }, false),
    ).toMatchObject({ amountStatus: "directionConflict", income: null });
    expect(
      resolveTransactionAmount({ amount: "+1000", direction: "출금" }, false),
    ).toMatchObject({ amountStatus: "directionConflict", expense: null });
  });

  it("실제 0원을 정상 중립 거래로 처리한다", () => {
    expect(resolveTransactionAmount({ amount: 0 }, false)).toMatchObject({
      amountStatus: "valid",
      amountSource: "single",
      income: 0,
      expense: 0,
    });
    expect(
      resolveTransactionAmount({ amount: 0, direction: "입금" }, false),
    ).toMatchObject({ amountStatus: "valid", income: 0, expense: 0 });
    expect(
      resolveTransactionAmount({ amount: 0, direction: "출금" }, false),
    ).toMatchObject({ amountStatus: "valid", income: 0, expense: 0 });
  });

  it("방향 없는 음수와 명시적 양수를 부호로 해석한다", () => {
    expect(resolveTransactionAmount({ amount: -500 }, false)).toMatchObject({
      amountStatus: "valid",
      income: 0,
      expense: 500,
    });
    expect(resolveTransactionAmount({ amount: "+500" }, false)).toMatchObject({
      amountStatus: "valid",
      income: 500,
      expense: 0,
    });
  });

  it("부호 체계 증거가 없는 양수는 방향 미확정으로 둔다", () => {
    expect(resolveTransactionAmount({ amount: 500 }, false)).toMatchObject({
      amountStatus: "unknownDirection",
      income: null,
      expense: null,
    });
  });

  it("부호 체계가 확인되면 방향 없는 양수를 입금으로 처리한다", () => {
    expect(resolveTransactionAmount({ amount: 500 }, true)).toMatchObject({
      amountStatus: "valid",
      income: 500,
      expense: 0,
    });
  });

  it("분리 컬럼이 모두 비었을 때만 단일 금액으로 대체한다", () => {
    expect(
      resolveTransactionAmount(
        { income: "", expense: "", amount: -300 },
        false,
      ),
    ).toMatchObject({ amountSource: "single", expense: 300 });
    expect(
      resolveTransactionAmount({ income: 0, expense: 0, amount: -300 }, false),
    ).toMatchObject({ amountSource: "separate", income: 0, expense: 0 });
    expect(
      resolveTransactionAmount({ income: "", expense: 0 }, false),
    ).toMatchObject({ amountSource: "separate", income: 0, expense: 0 });
  });

  it("분리 컬럼 한쪽 양수와 반대쪽 빈 값 또는 0을 허용한다", () => {
    expect(resolveTransactionAmount({ income: 100, expense: "" }, false)).toMatchObject({
      amountStatus: "valid",
      income: 100,
      expense: 0,
    });
    expect(resolveTransactionAmount({ income: 0, expense: 100 }, false)).toMatchObject({
      amountStatus: "valid",
      income: 0,
      expense: 100,
    });
  });

  it("분리 컬럼의 양쪽 비영점과 음수를 충돌로 처리한다", () => {
    expect(resolveTransactionAmount({ income: 100, expense: 50 }, false)).toMatchObject({
      amountStatus: "directionConflict",
    });
    expect(resolveTransactionAmount({ income: -100, expense: 0 }, false)).toMatchObject({
      amountStatus: "directionConflict",
    });
  });

  it("분리 컬럼이 잘못되면 단일 금액으로 대체하지 않는다", () => {
    expect(
      resolveTransactionAmount(
        { income: "잘못된 값", expense: "", amount: -300 },
        false,
      ),
    ).toMatchObject({ amountStatus: "invalidAmount", amountSource: "unresolved" });
  });

  it("분리 컬럼과 단일 금액이 다르면 분리 값을 유지한다", () => {
    expect(
      resolveTransactionAmount(
        { income: 100, expense: 0, amount: -300 },
        true,
      ),
    ).toMatchObject({
      amountStatus: "columnConflict",
      amountSource: "separate",
      income: 100,
      expense: 0,
    });
  });

  it("적격한 무방향 음수만 파일 부호 체계의 증거로 사용한다", () => {
    expect(
      hasSignedAmountEvidence([
        { income: 100, amount: -100 },
        { direction: "출금", amount: -200 },
        { amount: "잘못된 값" },
      ]),
    ).toBe(false);
    expect(
      hasSignedAmountEvidence([
        { income: "", expense: "", direction: "", amount: -300 },
      ]),
    ).toBe(true);
  });
});
