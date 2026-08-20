import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ManualBalanceSection from "./ManualBalanceSection";

describe("현재 잔액 직접 입력 UI", () => {
  it("파일 잔액이 없으면 입력과 적용 방법을 표시한다", () => {
    const markup = renderToStaticMarkup(
      <ManualBalanceSection
        fileLatestBalance={null}
        manualCurrentBalance={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(markup).toContain("현재 잔액 정보가 없습니다");
    expect(markup).toContain('for="manual-current-balance"');
    expect(markup).toContain('aria-invalid="false"');
    expect(markup).toContain("잔액 적용");
    expect(markup).toContain("Forecast 시작 잔액으로만 사용");
    expect(markup).toContain("브라우저 저장소에는 반영되지 않습니다");
    expect(markup).toContain("sm:flex-row");
    expect(markup).toContain("sm:w-auto");
  });

  it.each([0, 800_000])(
    "파일 잔액이 %s원이면 직접 입력 UI를 표시하지 않는다",
    (fileLatestBalance) => {
    expect(
      renderToStaticMarkup(
        <ManualBalanceSection
          fileLatestBalance={fileLatestBalance}
          manualCurrentBalance={3_000_000}
          onApply={vi.fn()}
          onClear={vi.fn()}
        />,
      ),
    ).toBe("");
    },
  );

  it("적용된 직접 입력 잔액과 제거 버튼을 구분해 표시한다", () => {
    const markup = renderToStaticMarkup(
      <ManualBalanceSection
        fileLatestBalance={null}
        manualCurrentBalance={-500_000}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(markup).toContain("직접 입력 잔액 -500,000원이 전망에");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("입력 잔액 지우기");
  });
});
