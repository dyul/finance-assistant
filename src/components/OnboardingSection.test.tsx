/// <reference types="node" />

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OnboardingSection, {
  SAMPLE_CSV_PATH,
  SAMPLE_EXCEL_PATH,
} from "./OnboardingSection";

describe("첫 화면 온보딩", () => {
  it("핵심 기능과 여러 권장 파일 구조를 안내한다", () => {
    const markup = renderToStaticMarkup(
      <OnboardingSection visible />,
    );

    expect(markup).toContain("3개월 현금흐름을 미리 확인하세요");
    expect(markup).toContain("자동 거래 인식");
    expect(markup).toContain("향후 3개월 전망");
    expect(markup).toContain("자금 부족 경고");
    expect(markup).toContain("예상 범위 비교");
    expect(markup).toContain("최근 입출금 흐름을 분석하고");
    expect(markup).toContain("향후 3개월 예상 잔액과 자금 부족 가능성");
    expect(markup).toContain("필요한 현금 여유(버퍼)");
    expect(markup).toContain("Excel 또는 CSV");
    expect(markup).toContain("권장 파일 형식");
    expect(markup).toContain("입금액 · 출금액");
    expect(markup).toContain("금액 · 거래구분");
    expect(markup).toContain("부호가 포함된 금액");
    expect(markup).toContain("잔액 컬럼은 선택 사항");
  });

  it("업로드와 실제 샘플 파일 다운로드 행동을 제공한다", () => {
    const markup = renderToStaticMarkup(
      <OnboardingSection visible />,
    );
    const sampleExcelPath = resolve(
      "public",
      "samples",
      "finance-assistant-sample.xlsx",
    );
    const sampleCsvPath = resolve(
      "public",
      "samples",
      "finance-assistant-sample.csv",
    );

    expect(markup).toContain('href="#file-upload"');
    expect(markup).toContain("Excel / CSV 업로드하기");
    expect(markup).toContain(`href="${SAMPLE_EXCEL_PATH}"`);
    expect(markup).toContain('download="finance-assistant-sample.xlsx"');
    expect(markup).toContain("샘플 Excel 다운로드");
    expect(markup).toContain(`href="${SAMPLE_CSV_PATH}"`);
    expect(markup).toContain('download="finance-assistant-sample.csv"');
    expect(markup).toContain("샘플 CSV 다운로드");
    expect(existsSync(sampleExcelPath)).toBe(true);
    expect(existsSync(sampleCsvPath)).toBe(true);
  });

  it("분석 파일이 있으면 온보딩 영역을 숨긴다", () => {
    expect(
      renderToStaticMarkup(<OnboardingSection visible={false} />),
    ).toBe("");
  });
});
