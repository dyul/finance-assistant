import { describe, expect, it } from "vitest";

import {
  manualBalanceSessionReducer,
  parseManualCurrentBalance,
  resolveForecastStartingBalance,
} from "./manualBalance";

describe("현재 잔액 직접 입력", () => {
  it.each([
    ["3000000", 3_000_000],
    ["3,000,000", 3_000_000],
    ["0", 0],
    ["-500000", -500_000],
    ["-500,000", -500_000],
  ])("%s를 유효한 잔액으로 해석한다", (input, expected) => {
    expect(parseManualCurrentBalance(input)).toEqual({
      valid: true,
      value: expected,
    });
  });

  it.each(["", "N/A", "잔액미정", "Infinity", "NaN"])(
    "%s는 적용하지 않는다",
    (input) => {
      expect(parseManualCurrentBalance(input).valid).toBe(false);
    },
  );

  it("Number 안전 정수 범위를 벗어나거나 원 미만이면 적용하지 않는다", () => {
    expect(
      parseManualCurrentBalance(String(Number.MAX_SAFE_INTEGER + 1)).valid,
    ).toBe(false);
    expect(parseManualCurrentBalance("1000.5").valid).toBe(false);
  });

  it("파일 잔액, 직접 입력 잔액, 없음 순서로 시작 잔액을 결정한다", () => {
    expect(resolveForecastStartingBalance(800_000, 3_000_000)).toEqual({
      value: 800_000,
      source: "file",
    });
    expect(resolveForecastStartingBalance(0, 3_000_000)).toEqual({
      value: 0,
      source: "file",
    });
    expect(resolveForecastStartingBalance(null, 0)).toEqual({
      value: 0,
      source: "manual",
    });
    expect(resolveForecastStartingBalance(null, -500_000)).toEqual({
      value: -500_000,
      source: "manual",
    });
    expect(resolveForecastStartingBalance(null, null)).toEqual({
      value: null,
      source: null,
    });
  });

  it("같은 파일 재분석에는 유지하고 새 파일·제거·설정 초기화에는 지운다", () => {
    const applied = manualBalanceSessionReducer(null, {
      type: "apply",
      balance: 3_000_000,
    });

    expect(
      manualBalanceSessionReducer(applied, {
        type: "sameFileReanalyzed",
      }),
    ).toBe(3_000_000);
    expect(manualBalanceSessionReducer(applied, { type: "newFile" })).toBeNull();
    expect(manualBalanceSessionReducer(applied, { type: "clear" })).toBeNull();
    expect(
      manualBalanceSessionReducer(applied, { type: "fileSettingsReset" }),
    ).toBeNull();
  });
});
