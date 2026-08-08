import { describe, expect, it } from "vitest";

import {
  formatReportCurrency,
  formatReportDate,
  formatReportSignedCurrency,
  getScenarioLabel,
} from "./reportPresentation";

describe("reportPresentation", () => {
  it("브라우저 로컬 날짜를 한국어 생성일로 표시한다", () => {
    expect(formatReportDate(new Date(2026, 7, 8))).toBe("2026년 8월 8일");
    expect(formatReportDate(new Date(Number.NaN))).toBe("-");
  });

  it("금액 부호와 시나리오 이름을 명확하게 표시한다", () => {
    expect(formatReportCurrency(-229333.33)).toBe("-229,333원");
    expect(formatReportSignedCurrency(953000)).toBe("+953,000원");
    expect(getScenarioLabel("conservative")).toBe("보수");
    expect(getScenarioLabel("base")).toBe("기준");
    expect(getScenarioLabel("optimistic")).toBe("낙관");
  });
});
