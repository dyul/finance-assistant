import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ScheduledTransactionSection from "./ScheduledTransactionSection";

describe("확정 예정 거래 영역", () => {
  it("입력 필드와 빈 목록 안내를 유지한다", () => {
    const markup = renderToStaticMarkup(
      <ScheduledTransactionSection
        forecastMonths={["2026-04", "2026-05", "2026-06"]}
        scheduledTransactions={[]}
        outOfPeriodCount={0}
        storageAvailable
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

  it("저장된 거래와 기간 밖·저장소 안내를 표시한다", () => {
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
        storageAvailable={false}
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
    expect(markup).toContain("현재 화면에서만 유지됩니다");
    expect(markup).toContain("삭제");
  });
});
