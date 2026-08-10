export const MAX_EXCEL_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_EXCEL_FILE_SIZE_LABEL = "10MB";

export type ExcelUploadValidationIssue =
  | "unsupportedFile"
  | "fileTooLarge";

interface ExcelUploadFileInfo {
  name: string;
  size: number;
}

const ALLOWED_EXCEL_EXTENSIONS = [".xlsx", ".xls"] as const;

export function validateExcelUpload(
  file: ExcelUploadFileInfo,
): ExcelUploadValidationIssue | null {
  const dotIndex = file.name.lastIndexOf(".");
  const extension =
    dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : "";

  if (
    !ALLOWED_EXCEL_EXTENSIONS.includes(
      extension as (typeof ALLOWED_EXCEL_EXTENSIONS)[number],
    )
  ) {
    return "unsupportedFile";
  }

  if (file.size > MAX_EXCEL_FILE_SIZE_BYTES) {
    return "fileTooLarge";
  }

  return null;
}
