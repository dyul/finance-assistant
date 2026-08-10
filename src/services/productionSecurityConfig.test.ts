import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface VercelHeader {
  key: string;
  value: string;
}

interface VercelConfig {
  headers: Array<{
    source: string;
    headers: VercelHeader[];
  }>;
}

describe("Production 보안 설정", () => {
  it("모든 정적 응답에 안전한 최소 Vercel 헤더를 적용한다", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as VercelConfig;
    const globalHeaders = config.headers.find(
      (entry) => entry.source === "/(.*)",
    )?.headers;

    expect(globalHeaders).toEqual(
      expect.arrayContaining([
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ]),
    );
  });

  it("public 샘플 폴더에는 합성 거래내역 샘플 하나만 둔다", () => {
    expect(
      readdirSync(resolve(process.cwd(), "public", "samples")),
    ).toEqual(["finance-assistant-sample.xlsx"]);
  });
});
