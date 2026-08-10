import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Header from "./Header";

describe("Header", () => {
  it("개인 표시명 대신 브라우저 전용 분석 안내를 표시한다", () => {
    const markup = renderToStaticMarkup(<Header />);

    expect(markup).toContain("브라우저 전용 분석");
    expect(markup).toContain("MVP Beta");
    expect(markup).toContain("개인사업자를 위한 3개월 현금흐름 전망");
    expect(markup).not.toContain("AI Financial Copilot");
    expect(markup).not.toContain("dyul");
  });
});
