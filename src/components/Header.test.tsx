import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Header from "./Header";

describe("Header", () => {
  it("개인 표시명 대신 브라우저 전용 분석 안내를 표시한다", () => {
    const markup = renderToStaticMarkup(<Header />);

    expect(markup).toContain("브라우저 전용 분석");
    expect(markup).not.toContain("dyul");
  });
});
