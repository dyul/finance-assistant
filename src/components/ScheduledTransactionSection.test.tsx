import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ScheduledTransactionSection from "./ScheduledTransactionSection";
import { validateScheduledTransactionForm } from "./scheduledTransactionFormValidation";

describe("확정 예정 거래 영역", () => {
  it("입력 필드와 빈 목록 안내를 유지한다", () => {
    const markup = renderToStaticMarkup(
      <ScheduledTransactionSection
        forecastMonths={["2026-04", "2026-05", "2026-06"]}
        scheduledTransactions={[]}
        outOfPeriodCount={0}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(markup).toContain("확정 예정 거래");
    expect(markup).toContain('type="date"');
    expect(markup).toContain("입금/출금");
    expect(markup).toContain("추가된 확정 예정 거래가 없습니다.");
    expect(markup).toContain("확정된 거래가 없다면 추가하지 않아도 됩니다");
    expect(markup).toContain("이 파일 설정 초기화");
  });

  it("저장된 거래와 기간 밖 안내를 표시한다", () => {
    const markup = renderToStaticMarkup(
      <ScheduledTransactionSection
        forecastMonths={["2026-04", "2026-05", "2026-06"]}
        scheduledTransactions={[
          {
            id: "scheduled-1",
            date: "2026-05-10",
            description: "거래처 대금",
            type: "income",
            amount: 500_000,
          },
        ]}
        outOfPeriodCount={1}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    expect(markup).toContain("2026-05-10");
    expect(markup).toContain("거래처 대금");
    expect(markup).toContain("500,000원");
    expect(markup).toContain("현재 3개월 전망 기간 밖인 거래가 1건");
    expect(markup).toContain("날짜로 다시");
    expect(markup).toContain("삭제");
  });

  it("예정일·내용·금액 누락을 입력 항목별로 안내한다", () => {
    expect(
      validateScheduledTransactionForm({
        date: "",
        description: " ",
        amountText: "",
        forecastMonths: ["2026-04", "2026-05", "2026-06"],
      }),
    ).toEqual({
      date: "예정일을 선택해주세요.",
      description: "거래 내용을 입력해주세요.",
      amount: "금액을 입력해주세요.",
    });
  });

  it("0원 이하 금액과 전망 기간 밖 날짜를 구체적으로 안내한다", () => {
    const result = validateScheduledTransactionForm({
      date: "2026-07-01",
      description: "세금 납부",
      amountText: "0",
      forecastMonths: ["2026-04", "2026-05", "2026-06"],
    });

    expect(result.date).toContain("3개월 전망 기간");
    expect(result.date).toContain("2026년 4월");
    expect(result.amount).toBe("금액은 0원보다 큰 숫자로 입력해주세요.");
  });
});
