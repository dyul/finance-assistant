import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { FutureSourceTransaction } from "../services/futureSourceTransaction";
import { FutureSourceTransactionsSectionView } from "./FutureSourceTransactionsSection";

function futureTransaction(
  index: number,
  overrides: Partial<FutureSourceTransaction> = {},
): FutureSourceTransaction {
  return {
    id: `future-${index}`,
    sourceIndex: index,
    date: `2026-${String(9 + (index % 3)).padStart(2, "0")}-10` as FutureSourceTransaction["date"],
    description: `합성 미래 거래 ${index}`,
    category: "other",
    type: "expense",
    amount: 10_000,
    recurringKey: `key-${index}`,
    ...overrides,
  };
}

function renderView({
  transactions = [futureTransaction(0)],
  detailsOpen = false,
  expanded = false,
  excludedIds = new Set<string>(),
}: {
  transactions?: FutureSourceTransaction[];
  detailsOpen?: boolean;
  expanded?: boolean;
  excludedIds?: ReadonlySet<string>;
} = {}) {
  return renderToStaticMarkup(
    <FutureSourceTransactionsSectionView
      transactions={transactions}
      forecastMonths={["2026-09", "2026-10", "2026-11"]}
      excludedIds={excludedIds}
      onInclusionChange={vi.fn()}
      detailsOpen={detailsOpen}
      expanded={expanded}
      onDetailsOpenChange={vi.fn()}
      onExpandedChange={vi.fn()}
    />,
  );
}

describe("파일 미래 거래 자동 반영 UI", () => {
  it("자동 반영 건수·수입·지출·기간 밖 건수를 안내한다", () => {
    const markup = renderView({
      transactions: [
        futureTransaction(0, { amount: 120_000 }),
        futureTransaction(1, {
          type: "income",
          amount: 500_000,
        }),
        futureTransaction(2, {
          date: "2026-12-05",
          amount: 90_000,
        }),
      ],
    });

    expect(markup).toContain("미래 거래 3건");
    expect(markup).toContain("현재 3개월 전망에 2건을 자동 반영");
    expect(markup).toContain("500,000원");
    expect(markup).toContain("120,000원");
    expect(markup).toContain("현재 전망 기간 밖");
    expect(markup).toContain("자동 반영 내역 보기");
  });

  it("상세 내역은 기본 10건만 표시하고 전체 보기·접기를 제공한다", () => {
    const transactions = Array.from({ length: 12 }, (_, index) =>
      futureTransaction(index),
    );
    const collapsedMarkup = renderView({
      transactions,
      detailsOpen: true,
    });
    const expandedMarkup = renderView({
      transactions,
      detailsOpen: true,
      expanded: true,
    });

    expect(
      collapsedMarkup.match(/data-future-source-row=/g),
    ).toHaveLength(10);
    expect(collapsedMarkup).toContain("미래 거래 전체 보기");
    expect(
      expandedMarkup.match(/data-future-source-row=/g),
    ).toHaveLength(12);
    expect(expandedMarkup).toContain("미래 거래 접기");
  });

  it("포함·제외·기간 밖 상태를 색상 외 텍스트와 접근 가능한 버튼으로 표시한다", () => {
    const markup = renderView({
      transactions: [
        futureTransaction(0),
        futureTransaction(1),
        futureTransaction(2, { date: "2026-12-05" }),
      ],
      detailsOpen: true,
      excludedIds: new Set(["future-1"]),
    });

    expect(markup).toContain("전망에 자동 반영");
    expect(markup).toContain("전망에서 제외");
    expect(markup).toContain("현재 3개월 전망 미반영");
    expect(markup).toContain(
      'aria-label="2026-09-10 미래 거래 전망에서 제외"',
    );
    expect(markup).toContain(
      'aria-label="2026-10-10 미래 거래 전망에 포함"',
    );
    expect(markup.match(/type="button"/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
