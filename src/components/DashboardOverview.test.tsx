import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DashboardOverview from "./DashboardOverview";

describe("Dashboard 핵심 결과", () => {
  it("현재 상태와 3개월 전망을 쉬운 설명과 함께 표시한다", () => {
    const markup = renderToStaticMarkup(
      <DashboardOverview
        currentBalance={-497_000}
        startingBalanceSource="file"
        latestMonthlySummary={{
          month: "2026-03",
          income: 1_000_000,
          expense: 2_785_000,
          netCashFlow: -1_785_000,
          transactionCount: 4,
        }}
        forecastSummary={{
          endingBalance: 456_000,
          cumulativeNetCashFlow: 953_000,
          lowestBalance: -229_333.33,
          negativeMonthCount: 1,
        }}
        selectedScenario="base"
      />,
    );

    expect(markup).toContain("한눈에 보는 현금 상태");
    expect(markup).toContain("최근 거래 기준 잔액");
    expect(markup).toContain("-497,000원");
    expect(markup).toContain("최근 월 순현금흐름");
    expect(markup).toContain("-1,785,000원");
    expect(markup).toContain("들어온 돈에서 나간 돈을 뺀 금액");
    expect(markup).toContain("3개월 후 예상 잔액");
    expect(markup).toContain("456,000원");
    expect(markup).toContain("자금 부족 예상 여부");
    expect(markup).toContain("1개월 예상");
    expect(markup).toContain("현재 선택한 기준 예상");
  });

  it("계산에 필요한 값이 없을 때 의미와 다음 조건을 안내한다", () => {
    const markup = renderToStaticMarkup(
      <DashboardOverview
        currentBalance={null}
        startingBalanceSource={null}
        latestMonthlySummary={null}
        forecastSummary={{
          endingBalance: null,
          cumulativeNetCashFlow: 0,
          lowestBalance: null,
          negativeMonthCount: 0,
        }}
        selectedScenario="base"
      />,
    );

    expect(markup).toContain("확인할 수 없음");
    expect(markup).toContain("계산할 수 없음");
    expect(markup).toContain("현재 잔액을 직접 입력해 향후 전망");
    expect(markup).toContain("유효한 거래일이 있으면");
  });

  it("모바일에서는 한 열로 시작하고 긴 숫자와 문구를 카드 안에서 줄바꿈한다", () => {
    const markup = renderToStaticMarkup(
      <DashboardOverview
        currentBalance={123_456_789_012}
        startingBalanceSource="file"
        latestMonthlySummary={null}
        forecastSummary={{
          endingBalance: 123_456_789_012,
          cumulativeNetCashFlow: 0,
          lowestBalance: 0,
          negativeMonthCount: 0,
        }}
        selectedScenario="optimistic"
      />,
    );

    expect(markup).toContain("sm:grid-cols-2");
    expect(markup).toContain("xl:grid-cols-4");
    expect(markup.match(/min-w-0/g)).toHaveLength(4);
    expect(markup.match(/break-words/g)).toHaveLength(4);
  });

  it("직접 입력 잔액을 파일에서 계산된 값과 구분한다", () => {
    const markup = renderToStaticMarkup(
      <DashboardOverview
        currentBalance={3_000_000}
        startingBalanceSource="manual"
        latestMonthlySummary={null}
        forecastSummary={{
          endingBalance: 4_000_000,
          cumulativeNetCashFlow: 1_000_000,
          lowestBalance: 3_300_000,
          negativeMonthCount: 0,
        }}
        selectedScenario="base"
      />,
    );

    expect(markup).toContain("현재 잔액 (직접 입력)");
    expect(markup).toContain("Forecast 시작 잔액으로만 사용");
    expect(markup).not.toContain("원본 파일에서 가장 최근 거래");
  });
});
