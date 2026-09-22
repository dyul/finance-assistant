import { describe, expect, it } from "vitest";

import { classifyTransactionNature } from "./financialNatureClassifier";

describe("financialNatureClassifier", () => {
  it("근거가 없으면 기존 일반 거래로 유지한다", () => {
    expect(
      classifyTransactionNature({
        description: "합성 생활비",
        direction: "expense",
      }),
    ).toBe("ordinary");
  });

  it.each([
    ["source category", { sourceCategory: "적금" }],
    ["source subcategory", { sourceSubcategory: "정기적금" }],
  ])("명확한 %s 신호로 저축을 분류한다", (_, source) => {
    expect(
      classifyTransactionNature({
        description: "합성 거래",
        direction: "expense",
        ...source,
      }),
    ).toBe("savings");
  });

  it("안전한 정확 description 신호로 적금 납입을 분류한다", () => {
    expect(
      classifyTransactionNature({
        description: "정기적금 납입",
        direction: "expense",
      }),
    ).toBe("savings");
  });

  it.each(["우리저축은행 식대", "적금 상담 수수료", "저축 캠페인 물품"])(
    "저축 유사 문자열 '%s'을 부분 일치로 오분류하지 않는다",
    (description) => {
      expect(
        classifyTransactionNature({ description, direction: "expense" }),
      ).toBe("ordinary");
    },
  );

  it.each(["투자", "주식", "펀드"])(
    "명확한 원본 분류 '%s'를 투자로 분류한다",
    (sourceCategory) => {
      expect(
        classifyTransactionNature({
          description: "합성 거래",
          direction: "expense",
          sourceCategory,
        }),
      ).toBe("investment");
    },
  );

  it("투자 유사 문자열을 부분 일치로 오분류하지 않는다", () => {
    expect(
      classifyTransactionNature({
        description: "투자상담료 결제",
        direction: "expense",
      }),
    ).toBe("ordinary");
  });

  it("출금 방향의 명확한 대출 원금 상환을 부채 거래로 분류한다", () => {
    expect(
      classifyTransactionNature({
        description: "대출 원금 상환",
        direction: "expense",
      }),
    ).toBe("debt");
  });

  it("이자수입을 대출 거래로 오분류하지 않는다", () => {
    expect(
      classifyTransactionNature({
        description: "이자수입",
        direction: "income",
      }),
    ).toBe("ordinary");
  });

  it.each(["내부이체", "내 계좌 이체", "내계좌이체"])(
    "명확한 원본 분류 '%s'를 내부이체로 분류한다",
    (sourceCategory) => {
      expect(
        classifyTransactionNature({
          description: "이체",
          direction: "expense",
          sourceCategory,
        }),
      ).toBe("internal_transfer");
    },
  );

  it("일반 이체 description만으로 내부이체를 추정하지 않는다", () => {
    expect(
      classifyTransactionNature({
        description: "이체",
        direction: "expense",
      }),
    ).toBe("ordinary");
  });

  it.each(["income", "expense"] as const)(
    "저축 성격을 %s 방향과 독립적으로 유지한다",
    (direction) => {
      expect(
        classifyTransactionNature({
          description: "합성 거래",
          direction,
          sourceSubcategory: "적금",
        }),
      ).toBe("savings");
    },
  );

  it("명확한 source metadata를 description보다 우선한다", () => {
    expect(
      classifyTransactionNature({
        description: "투자 계좌 송금",
        direction: "expense",
        sourceCategory: "적금",
      }),
    ).toBe("savings");
  });

  it("서로 충돌하는 source metadata는 ordinary로 보수적으로 처리한다", () => {
    expect(
      classifyTransactionNature({
        description: "정기적금 납입",
        direction: "expense",
        sourceCategory: "투자",
        sourceSubcategory: "적금",
      }),
    ).toBe("ordinary");
  });

  it("10,000건을 선형 시간 안에 결정적으로 분류한다", () => {
    const startedAt = performance.now();
    const results = Array.from({ length: 10_000 }, (_, index) =>
      classifyTransactionNature({
        description: index % 2 === 0 ? "정기적금 납입" : "합성 생활비",
        direction: "expense",
      }),
    );
    const elapsedMs = performance.now() - startedAt;

    console.info(
      `[Day47 nature] 10,000 transactions=${elapsedMs.toFixed(1)}ms`,
    );
    expect(results.filter((nature) => nature === "savings")).toHaveLength(
      5_000,
    );
    expect(elapsedMs).toBeLessThan(1_000);
  });
});
