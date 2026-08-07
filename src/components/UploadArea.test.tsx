import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InvalidDateWarning,
  TransactionDateValue,
} from "./UploadArea";
import { createForecastAnalysis } from "../services/forecastEngine";

describe("UploadArea 날짜 오류 안내", () => {
  it("날짜 오류 건수와 분석 제외 안내를 표시한다", () => {
    const markup = renderToStaticMarkup(
      <InvalidDateWarning count={2} />,
    );

    expect(markup).toContain("날짜를 확인할 수 없는 거래 2건");
    expect(markup).toContain("전체 입출금과 전체 거래 건수");
    expect(markup).toContain("월별 분석·반복 거래·최신 잔액·예측");
    expect(markup).toContain("전체 합계와 월별 합계가 다를 수");
  });

  it("날짜 오류가 없으면 안내를 표시하지 않는다", () => {
    expect(
      renderToStaticMarkup(<InvalidDateWarning count={0} />),
    ).toBe("");
  });

  it("null 날짜를 날짜 확인 필요로 표시한다", () => {
    expect(
      renderToStaticMarkup(<TransactionDateValue date={null} />),
    ).toContain("날짜 확인 필요");
    expect(
      renderToStaticMarkup(
        <TransactionDateValue date="2024-01-02" />,
      ),
    ).toBe("2024-01-02");
  });

  it("유효한 날짜 거래가 없으면 예측 상태를 비운다", () => {
    expect(createForecastAnalysis([], null)).toEqual({
      forecasts: [],
      cashRisk: null,
    });
  });
});
