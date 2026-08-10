import { describe, expect, it } from "vitest";

import {
  MAX_EXCEL_FILE_SIZE_BYTES,
  validateExcelUpload,
} from "./excelUploadValidation";

describe("Excel 업로드 사전 검증", () => {
  it("xlsx와 xls 확장자를 대소문자와 관계없이 허용한다", () => {
    expect(validateExcelUpload({ name: "거래내역.XLSX", size: 1 })).toBeNull();
    expect(validateExcelUpload({ name: "거래내역.xls", size: 1 })).toBeNull();
  });

  it("Excel이 아닌 확장자는 파싱 전에 차단한다", () => {
    expect(validateExcelUpload({ name: "거래내역.csv", size: 1 })).toBe(
      "unsupportedFile",
    );
    expect(validateExcelUpload({ name: "거래내역", size: 1 })).toBe(
      "unsupportedFile",
    );
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
        name: "거래내역.xlsx",
        size: MAX_EXCEL_FILE_SIZE_BYTES + 1,
      }),
    ).toBe("fileTooLarge");
  });
});
