import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import FileUploadSection from "./FileUploadSection";

describe("파일 업로드 영역", () => {
  it("파일 처리 중 입력을 비활성화하고 로딩 상태를 안내한다", () => {
    const markup = renderToStaticMarkup(
      <FileUploadSection
        fileName=""
        fileSize=""
        sheetNames={[]}
        sheetDetection={null}
        automaticSheetDetection={null}
        analysisMode={null}
        error=""
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
        fileName="day16.xlsx"
        fileSize="12.3 KB"
        sheetNames={["요약", "거래내역"]}
        sheetDetection={detection}
        automaticSheetDetection={detection}
        analysisMode="automatic"
        error=""
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
    expect(markup).toContain("현재 브라우저에서 분석되며");
    expect(markup).toContain("원본 거래내역을");
    expect(markup).toContain("브라우저 저장소에 저장하지 않습니다");
    expect(markup).toContain("예정거래와 선택 시나리오만");
  });
});
