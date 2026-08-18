export const MAX_EXCEL_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_EXCEL_FILE_SIZE_LABEL = "10MB";

export type ExcelUploadValidationIssue =
  | "unsupportedFile"
  | "fileTooLarge";

export type UploadFileType = "excel" | "csv";

interface ExcelUploadFileInfo {
  name: string;
  size: number;
  type?: string;
}

export function getUploadFileType(fileName: string): UploadFileType | null {
  const dotIndex = fileName.lastIndexOf(".");
  const extension =
    dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";

  if (extension === ".csv") {
    return "csv";
  }

  if (extension === ".xlsx" || extension === ".xls") {
    return "excel";
  }

  return null;
}

export function validateExcelUpload(
  file: ExcelUploadFileInfo,
): ExcelUploadValidationIssue | null {
  if (getUploadFileType(file.name) === null) {
    return "unsupportedFile";
  }

  if (file.size > MAX_EXCEL_FILE_SIZE_BYTES) {
    return "fileTooLarge";
  }

  return null;
}
