import type { ExcelWorkbook } from "./excelWorkbook";

export async function loadExcelWorkbook(
  arrayBuffer: ArrayBuffer,
): Promise<ExcelWorkbook> {
  const { readExcelWorkbook } = await import("./excelWorkbook");

  return readExcelWorkbook(arrayBuffer);
}
