import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  InvalidAmountWarning,
  InvalidDateWarning,
  TransactionAmountCells,
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

  it("계산 제외 금액 오류와 컬럼 충돌을 분리해 안내한다", () => {
    const markup = renderToStaticMarkup(
      <InvalidAmountWarning
        invalidAmountCount={1}
        unknownDirectionCount={2}
        directionConflictCount={3}
        columnConflictCount={4}
      />,
    );

    expect(markup).toContain("금액 계산에서 제외된 거래 6건");
    expect(markup).toContain("금액 오류 1건");
    expect(markup).toContain("방향 미확정 2건");
    expect(markup).toContain("방향 충돌 3건");
    expect(markup).toContain("다른 거래 4건");
    expect(markup).toContain("분리 입금·출금 컬럼 값을 우선");
  });

  it("금액 경고가 없으면 안내를 표시하지 않는다", () => {
    expect(
      renderToStaticMarkup(
        <InvalidAmountWarning
          invalidAmountCount={0}
          unknownDirectionCount={0}
          directionConflictCount={0}
          columnConflictCount={0}
        />,
      ),
    ).toBe("");
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

  it("금액 오류 거래에 확인 문구와 원본값을 표시한다", () => {
    const markup = renderToStaticMarkup(
      <TransactionAmountCells
        income={null}
        expense={null}
        amountStatus="unknownDirection"
        originalAmountValues={{
          income: null,
          expense: null,
          amount: "1,000",
          direction: "미확인",
        }}
      />,
    );

    expect(markup).toContain("입출금 구분 확인 필요");
    expect(markup).toContain("금액 1,000");
    expect(markup).toContain("구분 미확인");
    expect(markup).toContain('colSpan="2"');
  });

  it("정상 거래는 기존 입금·출금 두 칸으로 표시한다", () => {
    const markup = renderToStaticMarkup(
      <TransactionAmountCells
        income={1000}
        expense={0}
        amountStatus="valid"
        originalAmountValues={{
          income: "1000",
          expense: "0",
          amount: null,
          direction: null,
        }}
      />,
    );

    expect(markup).toContain("1,000원");
    expect(markup).not.toContain("확인 필요");
    expect(markup.match(/<td/g)).toHaveLength(2);
  });

  it("유효한 날짜 거래가 없으면 예측 상태를 비운다", () => {
    expect(createForecastAnalysis([], null)).toEqual({
      forecasts: [],
      cashRisk: null,
    });
  });
});
