import { describe, expect, it } from "vitest";

import {
  normalizeTransactionDate,
  normalizeTransactionDateTime,
  normalizeTransactionDateResult,
} from "./dateNormalizer";

describe("normalizeTransactionDate", () => {
  it("1900 날짜 체계의 Excel 일련번호를 변환한다", () => {
    expect(normalizeTransactionDate(45_292)).toBe("2024-01-01");
    expect(normalizeTransactionDate(45_292.75)).toBe("2024-01-01");
  });

  it("1904 날짜 체계를 구분한다", () => {
    expect(normalizeTransactionDate(0, { date1904: true })).toBe(
      "1904-01-01",
    );
    expect(normalizeTransactionDate(1, { date1904: true })).toBe(
      "1904-01-02",
    );
    expect(normalizeTransactionDate(60, { date1904: true })).toBe(
      "1904-03-01",
    );
  });

  it("1900 날짜 체계의 0과 가상 윤일을 거부한다", () => {
    expect(normalizeTransactionDate(0)).toBeNull();
    expect(normalizeTransactionDate(0, { date1904: false })).toBeNull();
    expect(normalizeTransactionDate(60)).toBeNull();
    expect(normalizeTransactionDate(60.5)).toBeNull();
    expect(normalizeTransactionDate(60.999_999)).toBeNull();
  });

  it("1900 가상 윤일 전후의 실제 날짜를 유지한다", () => {
    expect(normalizeTransactionDate(59)).toBe("1900-02-28");
    expect(normalizeTransactionDate(61)).toBe("1900-03-01");
  });

  it("음수와 숫자가 아닌 경계값을 날짜 체계와 관계없이 거부한다", () => {
    const invalidValues = [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
    ];

    for (const value of invalidValues) {
      expect(normalizeTransactionDate(value)).toBeNull();
      expect(
        normalizeTransactionDate(value, { date1904: true }),
      ).toBeNull();
    }
  });

  it("두 날짜 체계의 Excel 최대 유효 날짜를 허용한다", () => {
    expect(normalizeTransactionDate(2_958_465)).toBe(
      "9999-12-31",
    );
    expect(
      normalizeTransactionDate(2_957_003, { date1904: true }),
    ).toBe("9999-12-31");
  });

  it("Excel 최대 날짜 범위를 넘는 값을 거부한다", () => {
    expect(normalizeTransactionDate(2_958_466)).toBeNull();
    expect(
      normalizeTransactionDate(2_957_004, { date1904: true }),
    ).toBeNull();
  });

  it("최대 유효 날짜의 시간 소수부를 버리고 날짜를 유지한다", () => {
    expect(normalizeTransactionDate(2_958_465.999_999)).toBe(
      "9999-12-31",
    );
    expect(
      normalizeTransactionDate(2_957_003.999_999, {
        date1904: true,
      }),
    ).toBe("9999-12-31");
  });

  it("유효한 Date 객체의 로컬 달력 날짜를 유지한다", () => {
    const dateNearMidnight = new Date(2024, 0, 2, 0, 30);

    expect(normalizeTransactionDate(dateNearMidnight)).toBe(
      "2024-01-02",
    );
    expect(normalizeTransactionDate(new Date(Number.NaN))).toBeNull();
    expect(normalizeTransactionDateTime(dateNearMidnight)).toEqual({
      date: "2024-01-02",
      time: "00:30:00",
    });
    expect(normalizeTransactionDateTime(new Date(2024, 0, 2))).toEqual({
      date: "2024-01-02",
      time: null,
    });
  });

  it.each([
    ["2026.09.03 09:05", "2026-09-03", "09:05:00"],
    ["2026-09-03T13:35:42", "2026-09-03", "13:35:42"],
    ["2026/09/03 00:00", "2026-09-03", "00:00:00"],
    ["2026년 9월 3일 7:08:09", "2026-09-03", "07:08:09"],
    ["2026-09-03 13:35:42+09:00", "2026-09-03", "13:35:42"],
  ])(
    "문자열 %s의 로컬 거래 시각을 UTC 변환 없이 보존한다",
    (input, date, time) => {
      expect(normalizeTransactionDateTime(input)).toEqual({ date, time });
    },
  );

  it("날짜-only는 explicit time이 없음을 유지한다", () => {
    expect(normalizeTransactionDateTime("2026-09-03")).toEqual({
      date: "2026-09-03",
      time: null,
    });
  });

  it("Excel 일련번호의 소수부를 거래 시각으로 보존한다", () => {
    expect(normalizeTransactionDateTime(45_292 + 8 / 24)).toEqual({
      date: "2024-01-01",
      time: "08:00:00",
    });
    expect(normalizeTransactionDateTime(45_292 + 13.5 / 24)).toEqual({
      date: "2024-01-01",
      time: "13:30:00",
    });
    expect(normalizeTransactionDateTime(45_292)).toEqual({
      date: "2024-01-01",
      time: null,
    });
  });

  it.each([
    "2026-09-03 24:00",
    "2026-09-03 12:60",
    "2026-09-03 12:30:60",
  ])("잘못된 explicit time %s를 날짜 전체 오류로 처리한다", (input) => {
    expect(normalizeTransactionDateTime(input)).toBeNull();
  });

  it.each([
    ["2024-01-02", "2024-01-02"],
    ["2024/1/2", "2024-01-02"],
    ["2024.01.02", "2024-01-02"],
    ["2024년 1월 2일", "2024-01-02"],
    ["20240102", "2024-01-02"],
    [20240102, "2024-01-02"],
    [" 2024-01-02 ", "2024-01-02"],
    ["2024-01-02 23:59:59", "2024-01-02"],
    ["2024-01-02T23:30:00-02:00", "2024-01-02"],
    ["2024년 1월 2일 09:15", "2024-01-02"],
    ["2024-02-29", "2024-02-29"],
  ])("문자열 %s를 %s로 표준화한다", (input, expected) => {
    expect(normalizeTransactionDate(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "45292",
    "날짜미정",
    "N/A",
    "-",
    "2025-02-29",
    "2026-02-30",
    "2026-13-01",
    "2024-02-31",
    "2024-13-01",
    "2024-01-02 24:00",
    "해석할 수 없음",
  ])("해석하거나 추정할 수 없는 값 %s를 거부한다", (input) => {
    expect(normalizeTransactionDate(input)).toBeNull();
  });

  it("정규화 결과에 상태와 원본 값을 보존한다", () => {
    expect(normalizeTransactionDateResult(" 2026/1/3 ")).toEqual({
      status: "valid",
      value: "2026-01-03",
      originalValue: " 2026/1/3 ",
    });

    expect(normalizeTransactionDateResult("2026-02-30")).toEqual({
      status: "invalid",
      originalValue: "2026-02-30",
      reason: "지원하지 않거나 존재하지 않는 날짜입니다.",
    });
  });
});
