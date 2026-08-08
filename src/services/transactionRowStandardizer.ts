import type { ColumnMapping } from "./columnMapper";

export function standardizeTransactionRows(
  rows: Record<string, unknown>[],
  mappings: ColumnMapping[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const standardizedRow: Record<string, unknown> = {};

    for (const mapping of mappings) {
      if (mapping.standardName === "unknown") {
        continue;
      }

      standardizedRow[mapping.standardName] = row[mapping.originalName];
    }

    return standardizedRow;
  });
}
