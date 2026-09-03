import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import AnalysisIssuePanel from "./AnalysisIssuePanel";
import {
  createAnalysisLimitationIssues,
  createBlockingAnalysisIssue,
  createPartialAnalysisIssues,
} from "../services/analysisIssuePresentation";
import { analyzeDataQuality } from "../services/dataQualityAnalyzer";
import { calculateFinancialSummary } from "../services/financialEngine";
import { getLatestBalance } from "../services/forecastEngine";
import { parseTransactions } from "../services/transactionParser";

const normalQuality = {
  totalTransactionCount: 10,
  historicalTransactionCount: 10,
  amountIncludedCount: 10,
  dateAnalysisIncludedCount: 10,
  validDateCount: 10,
  invalidAmountCount: 0,
  invalidDateCount: 0,
  directionIssueCount: 0,
  futureDatedTransactionCount: 0,
  futureDatedIncome: 0,
  futureDatedExpense: 0,
};

const noAmountIssues = {
  invalidAmountCount: 0,
  unknownDirectionCount: 0,
  directionConflictCount: 0,
  directionOverrideCount: 0,
  columnConflictCount: 0,
};

describe("분석 오류·복구 안내", () => {
  it("거래 시트 탐지 실패를 blocking으로 표시하고 직접 설정 CTA를 제공한다", () => {
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel
        issues={[createBlockingAnalysisIssue("transactionSheetNotFound")]}
        ctaLabel="직접 설정해서 분석"
        onCta={vi.fn()}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("분석 중단");
    expect(markup).toContain("거래내역 표를 자동으로 찾지 못했습니다");
    expect(markup).toContain("직접 설정해서 분석");
    expect(markup).toContain("직접 설정은 100행까지 지원");
    expect(markup).toContain("헤더가 101행 이후라면");
  });

  it("유효 거래가 0건이면 0원 합계 대신 분석 불가 영향을 안내한다", () => {
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel
        issues={[createBlockingAnalysisIssue("noValidTransactions")]}
      />,
    );

    expect(markup).toContain("분석할 수 있는 거래를 찾지 못했습니다");
    expect(markup).toContain("재무 요약과 향후 전망을 계산하지 않았습니다");
    expect(markup).not.toContain("0원");
  });

  it("10MB를 초과한 파일을 분석 전에 차단하고 복구 방법을 안내한다", () => {
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel
        issues={[createBlockingAnalysisIssue("fileTooLarge")]}
      />,
    );

    expect(markup).toContain("파일 크기가 너무 큽니다");
    expect(markup).toContain("10MB 이하");
    expect(markup).toContain("파일을 읽지 않았으며");
    expect(markup).toContain("기간을 나누거나 불필요한 행·시트를 제거");
  });

  it("CSV 인코딩·문법·헤더 실패를 각각 복구 가능한 blocking으로 안내한다", () => {
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel
        issues={[
          createBlockingAnalysisIssue("csvDecodingFailed"),
          createBlockingAnalysisIssue("csvReadFailed"),
          createBlockingAnalysisIssue("csvHeaderNotFound"),
        ]}
      />,
    );

    expect(markup).toContain("CSV 문자 인코딩을 확인할 수 없습니다");
    expect(markup).toContain("UTF-8 형식으로 다시 저장");
    expect(markup).toContain("쉼표로 구분된 CSV 구조");
    expect(markup).toContain("CSV 거래내역 헤더를 자동으로 찾지 못했습니다");
    expect(markup).toContain("직접 설정은 100행까지 지원");
  });

  it("금액 오류는 정상 거래 계산을 유지하는 부분 분석 영향을 설명한다", () => {
    const issues = createPartialAnalysisIssues(
      {
        ...normalQuality,
        totalTransactionCount: 3,
        amountIncludedCount: 2,
        dateAnalysisIncludedCount: 2,
        invalidAmountCount: 1,
      },
      { ...noAmountIssues, invalidAmountCount: 1 },
    );
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={issues} />,
    );

    expect(markup).toContain("금액을 확인할 수 없는 거래 1건");
    expect(markup).toContain("해당 거래는 전체 거래 건수에는 포함");
    expect(markup).toContain('href="#transaction-classification"');
  });

  it("날짜 오류가 전체 합계에는 포함되고 날짜 기반 분석에는 제외되는 정책을 표시한다", () => {
    const issues = createPartialAnalysisIssues(
      {
        ...normalQuality,
        totalTransactionCount: 10,
        dateAnalysisIncludedCount: 8,
        validDateCount: 8,
        invalidDateCount: 2,
      },
      noAmountIssues,
    );
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={issues} />,
    );

    expect(markup).toContain("날짜를 확인할 수 없는 거래 2건");
    expect(markup).toContain("전체 입출금에는 포함");
    expect(markup).toContain("월별 현금흐름·반복거래·최근 잔액·향후 전망에서는 제외");
  });

  it("미래 날짜 거래를 실적에서 제외하고 유효 거래의 Forecast 자동 반영을 안내한다", () => {
    const issues = createPartialAnalysisIssues(
      {
        ...normalQuality,
        totalTransactionCount: 13,
        historicalTransactionCount: 10,
        amountIncludedCount: 10,
        dateAnalysisIncludedCount: 10,
        validDateCount: 13,
        futureDatedTransactionCount: 3,
        futureDatedExpense: 106_670,
      },
      noAmountIssues,
    );
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={issues} />,
    );

    expect(markup).toContain("미래 날짜 거래 3건을 별도로 확인");
    expect(markup).toContain("과거 입출금 합계·월별 흐름·반복 거래·수입 추세·최근 잔액에서는 제외");
    expect(markup).toContain("현재 3개월 전망 범위 안에서 자동 반영");
    expect(markup).toContain("자동 반영 내역에서 전망 반영 여부를 확인");
    expect(markup).not.toContain("오류 거래 확인");
  });

  it("날짜 오류 2건이 있는 4건 fixture에서 전체 금액과 최근 잔액 정책을 함께 지킨다", () => {
    const parsed = parseTransactions([
      {
        date: "2026-01-15",
        description: "정상 입금",
        income: 500_000,
        balance: 500_000,
      },
      {
        date: "날짜 미정",
        description: "날짜 오류 입금",
        income: 200_000,
        balance: 700_000,
      },
      {
        date: "2026-02-20",
        description: "정상 입금 2",
        income: 300_000,
        balance: 1_000_000,
      },
      {
        date: "2026-02-30",
        description: "날짜 오류 출금",
        expense: 100_000,
        balance: 900_000,
      },
    ]);
    const quality = analyzeDataQuality(parsed.transactions);
    const summary = calculateFinancialSummary(parsed.transactions);
    const issues = createPartialAnalysisIssues(quality, parsed);
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={issues} />,
    );

    expect(summary).toMatchObject({
      transactionCount: 4,
      validAmountTransactionCount: 4,
      totalIncome: 1_000_000,
      totalExpense: 100_000,
    });
    expect(quality).toMatchObject({
      totalTransactionCount: 4,
      amountIncludedCount: 4,
      dateAnalysisIncludedCount: 2,
      validDateCount: 2,
      invalidDateCount: 2,
    });
    expect(getLatestBalance(parsed.transactions)).toBe(1_000_000);
    expect(markup).toContain("날짜를 확인할 수 없는 거래 2건");
    expect(markup).toContain("문제");
    expect(markup).toContain("분석 영향");
    expect(markup).toContain("해결 방법");
  });

  it("방향 미확정 거래가 입출금 계산에서 제외됨을 안내한다", () => {
    const issues = createPartialAnalysisIssues(
      normalQuality,
      { ...noAmountIssues, unknownDirectionCount: 1 },
    );
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={issues} />,
    );

    expect(markup).toContain("입금·출금 구분을 확인할 수 없는 거래 1건");
    expect(markup).toContain("입출금 합계와 날짜 기반 분석에서 제외");
  });

  it("최근 잔액 없음과 localStorage 실패를 blocking이 아닌 기능 제한으로 표시한다", () => {
    const issues = createAnalysisLimitationIssues({
      fileLatestBalanceAvailable: false,
      manualCurrentBalanceApplied: false,
      recurringTransactionCount: 0,
      storageAvailable: false,
    });
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={issues} />,
    );

    expect(markup).toContain("향후 잔액 전망을 계산할 수 없습니다");
    expect(markup).toContain("입출금 분석은 확인할 수 있지만");
    expect(markup).toContain("브라우저에 설정을 저장하지 못했습니다");
    expect(markup).toContain("현재 분석은 계속 사용할 수 있지만");
    expect(markup).toContain("기능 제한");
    expect(markup).not.toContain("분석 중단");
  });

  it("정상 Day 8 조건에는 새 오류 issue가 생성되지 않는다", () => {
    expect(
      createPartialAnalysisIssues(normalQuality, noAmountIssues),
    ).toEqual([]);
    expect(
      createAnalysisLimitationIssues({
        fileLatestBalanceAvailable: true,
        manualCurrentBalanceApplied: false,
        recurringTransactionCount: 3,
        storageAvailable: true,
      }),
    ).toEqual([]);
    expect(
      renderToStaticMarkup(<AnalysisIssuePanel issues={[]} />),
    ).toBe("");
  });

  it("직접 잔액 적용 후 원본 제한과 Forecast 해소 상태를 구분한다", () => {
    const issues = createAnalysisLimitationIssues({
      fileLatestBalanceAvailable: false,
      manualCurrentBalanceApplied: true,
      recurringTransactionCount: 2,
      storageAvailable: true,
    });
    const markup = renderToStaticMarkup(
      <AnalysisIssuePanel issues={issues} />,
    );

    expect(markup).toContain("원본 파일에 잔액 정보가 없습니다");
    expect(markup).toContain("직접 입력한 현재 잔액으로 향후 전망");
    expect(markup).not.toContain("향후 잔액 전망을 계산할 수 없습니다");
  });
});
