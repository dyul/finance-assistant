export function createUniqueColumnNames(headerRow: unknown[]): string[] {
  const usedNames = new Map<string, number>();

  return headerRow.map((cell, columnIndex) => {
    const rawName = String(cell ?? "").trim();
    const baseName = rawName || `빈 컬럼 ${columnIndex + 1}`;
    const duplicateCount = usedNames.get(baseName) ?? 0;

    usedNames.set(baseName, duplicateCount + 1);

    return duplicateCount === 0
      ? baseName
      : `${baseName}_${duplicateCount}`;
  });
}

export function hasDuplicateColumnNames(headerRow: unknown[]): boolean {
  const usedNames = new Set<string>();

  for (const cell of headerRow) {
    const normalizedName = String(cell ?? "").trim().toLowerCase();

    if (!normalizedName) {
      continue;
    }

    if (usedNames.has(normalizedName)) {
      return true;
    }

    usedNames.add(normalizedName);
  }

  return false;
}
