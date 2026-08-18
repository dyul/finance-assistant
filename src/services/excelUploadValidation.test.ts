import { describe, expect, it } from "vitest";

import {
  getUploadFileType,
  MAX_EXCEL_FILE_SIZE_BYTES,
  validateExcelUpload,
} from "./excelUploadValidation";

describe("Excel 업로드 사전 검증", () => {
  it("xlsx, xls와 csv 확장자를 대소문자와 관계없이 허용한다", () => {
    expect(validateExcelUpload({ name: "거래내역.XLSX", size: 1 })).toBeNull();
    expect(validateExcelUpload({ name: "거래내역.xls", size: 1 })).toBeNull();
    expect(validateExcelUpload({ name: "거래내역.CSV", size: 1 })).toBeNull();
  });

  it("지원 형식이 아닌 확장자는 파싱 전에 차단한다", () => {
    expect(validateExcelUpload({ name: "거래내역.tsv", size: 1 })).toBe(
      "unsupportedFile",
    );
    expect(validateExcelUpload({ name: "거래내역", size: 1 })).toBe(
      "unsupportedFile",
    );
  });

  it("MIME과 무관하게 확장자로 Excel과 CSV 경로를 구분한다", () => {
    expect(getUploadFileType("거래.XLSX")).toBe("excel");
    expect(getUploadFileType("거래.xls")).toBe("excel");
    expect(getUploadFileType("거래.csv")).toBe("csv");
    expect(getUploadFileType("거래.txt")).toBeNull();
    expect(
      [
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "",
      ].map((type) =>
        validateExcelUpload({ name: "거래.csv", size: 1, type }),
      ),
    ).toEqual([null, null, null, null]);
  });

  it("10MB 파일은 허용하고 이를 1바이트 초과하면 차단한다", () => {
    expect(
      validateExcelUpload({
        name: "거래내역.xlsx",
        size: MAX_EXCEL_FILE_SIZE_BYTES,
      }),
    ).toBeNull();
    expect(
      validateExcelUpload({
        name: "거래내역.csv",
        size: MAX_EXCEL_FILE_SIZE_BYTES + 1,
      }),
    ).toBe("fileTooLarge");
  });
});
