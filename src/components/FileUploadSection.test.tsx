import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import FileUploadSection from "./FileUploadSection";

describe("파일 업로드 영역", () => {
  it("파일 처리 중 입력을 비활성화하고 로딩 상태를 안내한다", () => {
    const markup = renderToStaticMarkup(
      <FileUploadSection
        sourceType={null}
        fileName=""
        fileSize=""
        sheetNames={[]}
        sheetDetection={null}
        automaticSheetDetection={null}
        analysisMode={null}
        isProcessingFile
        manualMappingOpen={false}
        canConfigureManual={false}
        onFileChange={vi.fn()}
        onToggleManualMapping={vi.fn()}
        onReturnToAutomatic={vi.fn()}
      />,
    );

    expect(markup).toContain("파일을 분석하고 있습니다...");
    expect(markup).toContain("disabled");
    expect(markup).toContain('role="status"');
  });

  it("기존 자동 분석 정보와 수동 수정 진입 버튼을 유지한다", () => {
    const detection = {
      sheetName: "거래내역",
      sheetIndex: 1,
      headerRowIndex: 3,
      score: 90,
      confidence: "high" as const,
      reasons: ["거래일 컬럼 확인", "유효 거래 확인"],
      validTransactionRowCount: 2,
      sampledDataRowCount: 2,
      coreColumnCount: 4,
      amountStructure: "separate" as const,
      ambiguous: false,
    };
    const markup = renderToStaticMarkup(
      <FileUploadSection
        sourceType="excel"
        fileName="day16.xlsx"
        fileSize="12.3 KB"
        sheetNames={["요약", "거래내역"]}
        sheetDetection={detection}
        automaticSheetDetection={detection}
        analysisMode="automatic"
        isProcessingFile={false}
        manualMappingOpen={false}
        canConfigureManual
        onFileChange={vi.fn()}
        onToggleManualMapping={vi.fn()}
        onReturnToAutomatic={vi.fn()}
      />,
    );

    expect(markup).toContain("day16.xlsx");
    expect(markup).toContain("2개");
    expect(markup).toContain("분석 방식");
    expect(markup).toContain("자동");
    expect(markup).toContain("거래내역");
    expect(markup).toContain("높음");
    expect(markup).toContain("자동 인식 수정");
    expect(markup).toContain("서버로 전송하지 않고 현재 브라우저에서");
    expect(markup).toContain("분석합니다");
    expect(markup).toContain("원본 거래내역은");
    expect(markup).toContain("브라우저 저장소에 저장하지 않습니다");
    expect(markup).toContain("확정 예정 거래와 선택 예상 범위만");
    expect(markup).toContain("최대 10MB");
    expect(markup).toContain("자동 인식 확실도");
    expect(markup).toContain('class="sr-only"');
    expect(markup).toContain("focus-within:outline-blue-600");
  });

  it("CSV 입력·형식·인코딩을 시트 개념 없이 안내한다", () => {
    const detection = {
      sheetName: "CSV",
      sheetIndex: 0,
      headerRowIndex: 0,
      score: 90,
      confidence: "high" as const,
      reasons: ["거래일 컬럼 확인"],
      validTransactionRowCount: 2,
      sampledDataRowCount: 2,
      coreColumnCount: 4,
      amountStructure: "separate" as const,
      ambiguous: false,
    };
    const markup = renderToStaticMarkup(
      <FileUploadSection
        sourceType="csv"
        textEncoding="euc-kr"
        fileName="거래내역.csv"
        fileSize="2.1 KB"
        sheetNames={["CSV"]}
        sheetDetection={detection}
        automaticSheetDetection={detection}
        analysisMode="automatic"
        isProcessingFile={false}
        manualMappingOpen={false}
        canConfigureManual
        onFileChange={vi.fn()}
        onToggleManualMapping={vi.fn()}
        onReturnToAutomatic={vi.fn()}
      />,
    );

    expect(markup).toContain("Excel / CSV 파일 선택");
    expect(markup).toContain('accept=".xlsx,.xls,.csv"');
    expect(markup).toContain("파일 형식");
    expect(markup).toContain("CP949 / EUC-KR");
    expect(markup).toContain("분석 대상");
    expect(markup).not.toContain("시트 수");
    expect(markup).not.toContain("분석 시트");
  });
});
