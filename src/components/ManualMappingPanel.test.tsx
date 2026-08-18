import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ManualMappingPanel from "./ManualMappingPanel";

describe("수동 매핑 패널", () => {
  it("자동 인식 초기값, 헤더 행, 컬럼 후보와 preview를 표시한다", () => {
    const markup = renderToStaticMarkup(
      <ManualMappingPanel
        sourceType="excel"
        sheetNames={["요약", "Sheet1"]}
        mapping={{
          sheetName: "Sheet1",
          headerRowIndex: 3,
          dateColumn: "거래일",
          descriptionColumn: "적요",
          balanceColumn: "잔액",
          amountMode: "split",
          incomeColumn: "입금액",
          expenseColumn: "출금액",
        }}
        preview={{
          columns: ["거래일", "적요", "입금액", "출금액", "잔액"],
          rows: [
            {
              거래일: "2026-01-01",
              적요: "상품판매",
              입금액: 500_000,
              출금액: "",
              잔액: 500_000,
            },
          ],
          headerRowLimit: 5,
        }}
        errors={[]}
        canReturnToAutomatic
        onSheetChange={vi.fn()}
        onHeaderRowChange={vi.fn()}
        onMappingChange={vi.fn()}
        onAnalyze={vi.fn()}
        onReturnToAutomatic={vi.fn()}
      />,
    );

    expect(markup).toContain("직접 분석 설정");
    expect(markup).toContain("Sheet1");
    expect(markup).toContain('value="3" selected=""');
    expect(markup).toContain("4행");
    expect(markup).toContain("입금/출금 분리형");
    expect(markup).toContain("상품판매");
    expect(markup).toContain("이 설정으로 분석");
    expect(markup).toContain("자동 인식으로 되돌리기");
    expect(markup).toContain("101행 이후의 헤더는 지원 범위 밖입니다.");
  });

  it("실제 시트 범위 안에서 최대 100행까지만 헤더 후보를 표시한다", () => {
    const markup = renderToStaticMarkup(
      <ManualMappingPanel
        sourceType="excel"
        sheetNames={["Sheet1"]}
        mapping={{
          sheetName: "Sheet1",
          headerRowIndex: 99,
          dateColumn: "거래일",
          amountMode: "signed",
          amountColumn: "금액",
        }}
        preview={{
          columns: ["거래일", "금액"],
          rows: [],
          headerRowLimit: 100,
        }}
        errors={[]}
        canReturnToAutomatic={false}
        onSheetChange={vi.fn()}
        onHeaderRowChange={vi.fn()}
        onMappingChange={vi.fn()}
        onAnalyze={vi.fn()}
        onReturnToAutomatic={vi.fn()}
      />,
    );

    expect(markup).toContain('value="99" selected=""');
    expect(markup).toContain("100행");
    expect(markup).not.toContain('value="100"');
  });

  it("필수값과 중복 선택 오류를 패널에 표시한다", () => {
    const markup = renderToStaticMarkup(
      <ManualMappingPanel
        sourceType="excel"
        sheetNames={["Sheet1"]}
        mapping={{
          sheetName: "Sheet1",
          headerRowIndex: 0,
          dateColumn: "",
          amountMode: "signed",
          amountColumn: "",
        }}
        preview={{
          columns: ["거래일", "금액"],
          rows: [],
          headerRowLimit: 2,
        }}
        errors={[
          "거래일 컬럼은 필수입니다.",
          "부호형 금액 컬럼을 선택해주세요.",
        ]}
        canReturnToAutomatic={false}
        onSheetChange={vi.fn()}
        onHeaderRowChange={vi.fn()}
        onMappingChange={vi.fn()}
        onAnalyze={vi.fn()}
        onReturnToAutomatic={vi.fn()}
      />,
    );

    expect(markup).toContain("설정을 확인해주세요.");
    expect(markup).toContain("거래일 컬럼은 필수입니다.");
    expect(markup).toContain("부호형 금액 컬럼을 선택해주세요.");
  });

  it("헤더를 찾지 못하면 사용자가 바꿔야 할 설정을 안내한다", () => {
    const markup = renderToStaticMarkup(
      <ManualMappingPanel
        sourceType="excel"
        sheetNames={["Sheet1"]}
        mapping={{
          sheetName: "Sheet1",
          headerRowIndex: 0,
          dateColumn: "",
          amountMode: "signed",
          amountColumn: "",
        }}
        preview={{ columns: [], rows: [], headerRowLimit: 3 }}
        errors={[]}
        canReturnToAutomatic={false}
        onSheetChange={vi.fn()}
        onHeaderRowChange={vi.fn()}
        onMappingChange={vi.fn()}
        onAnalyze={vi.fn()}
        onReturnToAutomatic={vi.fn()}
      />,
    );

    expect(markup).toContain("선택한 행에서 컬럼명을 찾지 못했습니다");
    expect(markup).toContain("헤더 행 번호로 다시 선택");
  });

  it("CSV에서는 시트 선택처럼 보이지 않도록 분석 대상을 고정한다", () => {
    const markup = renderToStaticMarkup(
      <ManualMappingPanel
        sourceType="csv"
        sheetNames={["CSV"]}
        mapping={{
          sheetName: "CSV",
          headerRowIndex: 30,
          dateColumn: "거래일",
          amountMode: "signed",
          amountColumn: "금액",
        }}
        preview={{
          columns: ["거래일", "금액"],
          rows: [],
          headerRowLimit: 100,
        }}
        errors={[]}
        canReturnToAutomatic={false}
        onSheetChange={vi.fn()}
        onHeaderRowChange={vi.fn()}
        onMappingChange={vi.fn()}
        onAnalyze={vi.fn()}
        onReturnToAutomatic={vi.fn()}
      />,
    );

    expect(markup).toContain("분석 대상");
    expect(markup).toContain("CSV 파일");
    expect(markup).not.toContain("분석 시트");
  });
});
