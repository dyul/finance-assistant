import { describe, expect, it } from "vitest";
import {
  admitFiles,
  attachTransactionSource,
  initialMultiFileState,
  multiFileReducer,
  type FileAnalysisSession,
} from "./multiFileSession";
import { parseTransactions } from "./transactionParser";
import {
  createFutureSourceTransactions,
  futureSourceSelectionReducer,
  partitionFutureSourceTransactionsByForecastMonths,
  toFileScheduledTransactions,
} from "./futureSourceTransaction";
import { createScenarioForecastAnalyses } from "./forecastEngine";
import type { RecurringTransaction } from "./recurringTransactionDetector";

const MIB = 1024 * 1024;

function file(name: string, size: number): File {
  return { name, size } as File;
}

function session(id: string, name = `${id}.csv`, size = 1): FileAnalysisSession {
  return {
    fileSource: { id, displayName: name, sizeBytes: size, sourceType: "csv", selectionId: `${id}:selection-0` },
    file: file(name, size),
    status: "loading",
    transactionCount: 0,
    error: null,
  };
}

describe("다중 파일 세션", () => {
  it("한 번에 여러 파일을 받으며 같은 파일명도 서로 다른 ID로 유지한다", () => {
    let next = 0;
    const admission = admitFiles(
      [file("거래내역.csv", 1), file("거래내역.csv", 2)],
      [],
      () => `file-${++next}`,
    );
    expect(admission.rejected).toEqual([]);
    expect(admission.accepted.map((item) => item.fileSource.id)).toEqual(["file-1", "file-2"]);
    expect(admission.accepted.map((item) => item.fileSource.displayName)).toEqual(["거래내역.csv", "거래내역.csv"]);
    expect(admission.accepted.map((item) => item.status)).toEqual(["loading", "loading"]);
  });

  it("기존 파일에 추가하고 5개 제한을 적용하며 거부된 파일 뒤의 유효 파일은 받는다", () => {
    const existing = [session("a"), session("b"), session("c")];
    let next = 0;
    const admission = admitFiles(
      [file("too-large.csv", 11 * MIB), file("d.csv", 1), file("e.xls", 1), file("f.xlsx", 1)],
      existing,
      () => `new-${++next}`,
    );
    expect(admission.accepted.map((item) => item.fileSource.displayName)).toEqual(["d.csv", "e.xls"]);
    expect(admission.rejected).toHaveLength(2);
    expect(admission.rejected[0]).toContain("파일당 최대 10MB");
    expect(admission.rejected[1]).toContain("최대 5개");
    const state = multiFileReducer({ sessions: existing, activeFileSourceId: "a" }, { type: "add", sessions: admission.accepted });
    expect(state.sessions).toHaveLength(5);
    expect(state.activeFileSourceId).toBe("a");
  });

  it("전체 25MiB를 업로드 순서대로 계산하며 한 파일 거부가 뒤 파일을 막지 않는다", () => {
    const existing = [session("a", "a.csv", 9 * MIB), session("b", "b.csv", 9 * MIB)];
    const admission = admitFiles(
      [file("too-much.csv", 10 * MIB), file("fits.csv", 7 * MIB)],
      existing,
      () => "new",
    );
    expect(admission.rejected).toHaveLength(1);
    expect(admission.rejected[0]).toContain("전체 파일 크기 최대 25MB");
    expect(admission.accepted.map((item) => item.fileSource.displayName)).toEqual(["fits.csv"]);
  });

  it("파일별 완료·오류를 격리하고 제거된 파일의 늦은 완료를 무시한다", () => {
    const added = multiFileReducer(initialMultiFileState, { type: "add", sessions: [session("a"), session("b"), session("c")] });
    const readyA = multiFileReducer(added, { type: "update", id: "a", status: "ready", transactionCount: 10, error: null });
    const failedB = multiFileReducer(readyA, { type: "update", id: "b", status: "error", transactionCount: 0, error: "읽기 실패" });
    const readyC = multiFileReducer(failedB, { type: "update", id: "c", status: "ready", transactionCount: 20, error: null });
    expect(readyC.sessions.map((item) => item.status)).toEqual(["ready", "error", "ready"]);
    const withoutA = multiFileReducer(readyC, { type: "remove", id: "a" });
    expect(withoutA.activeFileSourceId).toBe("b");
    expect(multiFileReducer(withoutA, { type: "update", id: "a", status: "ready", transactionCount: 99, error: null })).toBe(withoutA);
    expect(multiFileReducer(withoutA, { type: "remove", id: "b" }).sessions.map((item) => item.fileSource.id)).toEqual(["c"]);
  });

  it("활성 파일 전환·전체 초기화를 파일 ID로 처리한다", () => {
    const added = multiFileReducer(initialMultiFileState, { type: "add", sessions: [session("a"), session("b")] });
    expect(added.activeFileSourceId).toBe("a");
    const selected = multiFileReducer(added, { type: "select", id: "b" });
    expect(selected.activeFileSourceId).toBe("b");
    expect(multiFileReducer(selected, { type: "select", id: "missing" })).toBe(selected);
    expect(multiFileReducer(selected, { type: "reset" })).toEqual(initialMultiFileState);
  });

  it("동일 파일명·동일 행도 거래 ID가 다르고 파서 원본 행 번호와 거래를 보존한다", () => {
    const parsed = parseTransactions([
      { date: "2026-01-02", description: "입금", income: 1000, expense: 0, balance: 0 },
    ]).transactions;
    const a = attachTransactionSource(parsed, session("a", "same.csv").fileSource, "CSV", 0);
    const b = attachTransactionSource(parsed, session("b", "same.csv").fileSource, "CSV", 0);
    expect(a[0].transactionSourceId).not.toBe(b[0].transactionSourceId);
    expect(a[0].sourceRowIndex).toBe(parsed[0].sourceRowIndex);
    expect(a[0].source.sourceRowIndex).toBe(parsed[0].sourceRowIndex);
    expect(a[0].balance).toBe(0);
    expect(parsed[0]).not.toHaveProperty("source");
    expect(attachTransactionSource(parsed, session("a", "same.csv").fileSource, "CSV", 0)[0].transactionSourceId).toBe(a[0].transactionSourceId);
  });

  it("동일 파일명 중 하나만 ID로 제거하고 미래 거래 선택 ID도 파일별로 다르게 만든다", () => {
    const added = multiFileReducer(initialMultiFileState, { type: "add", sessions: [session("a", "same.csv"), session("b", "same.csv")] });
    const remaining = multiFileReducer(added, { type: "remove", id: "a" });
    expect(remaining.sessions.map((item) => item.fileSource.id)).toEqual(["b"]);
    const parsed = parseTransactions([{ date: "2099-01-02", description: "입금", income: 1000, expense: 0, balance: 0 }]).transactions;
    const a = attachTransactionSource(parsed, added.sessions[0].fileSource, "CSV", 0);
    const b = attachTransactionSource(parsed, added.sessions[1].fileSource, "CSV", 0);
    expect(createFutureSourceTransactions(a, "2026-09-28")[0].id).not.toBe(createFutureSourceTransactions(b, "2026-09-28")[0].id);
  });

  it("같은 거래 ID라도 수동 매핑 재분석 시 해당 파일의 제외를 지우고 Forecast에 다시 포함한다", () => {
    const source = session("a", "same.csv").fileSource;
    const parsed = parseTransactions([
      { date: "2026-10-02", description: "미래 지출", income: 0, expense: 100, balance: null },
    ]).transactions;
    const automatic = createFutureSourceTransactions(
      attachTransactionSource(parsed, source, "CSV", 0),
      "2026-09-28",
    );
    const excluded = futureSourceSelectionReducer([], {
      type: "setIncluded",
      id: automatic[0].id,
      included: false,
    });

    const manuallyRemapped = parseTransactions([
      { date: "2026-10-02", description: "미래 지출", income: 0, expense: 125, balance: null },
    ]).transactions;
    const manualSameLocation = createFutureSourceTransactions(
      attachTransactionSource(manuallyRemapped, source, "CSV", 0),
      "2026-09-28",
    );
    expect(manualSameLocation[0].id).toBe(automatic[0].id);
    const afterManualAnalysis = futureSourceSelectionReducer(excluded, {
      type: "manualMappingReanalyzed",
    });
    expect(afterManualAnalysis).toEqual([]);

    const recurring: RecurringTransaction = {
      description: "정기 수입",
      category: "revenue",
      categoryName: "매출",
      type: "income",
      averageAmount: 100,
      monthlyAmounts: [{ month: "2026-09", amount: 100 }],
      occurrenceCount: 1,
      activeMonthCount: 1,
      firstMonth: "2026-09",
      lastMonth: "2026-09",
      confidence: "high",
    };
    const forecastMonths = createScenarioForecastAnalyses([recurring], 1_000).base.forecasts.map((item) => item.month);
    const forecastExpense = (excludedIds: string[]) => {
      const scope = partitionFutureSourceTransactionsByForecastMonths(
        manualSameLocation,
        forecastMonths,
        new Set(excludedIds),
      );
      return createScenarioForecastAnalyses(
        [recurring],
        1_000,
        toFileScheduledTransactions(scope.included),
      ).base.forecasts[0].scheduledExpense;
    };
    expect(forecastExpense(excluded)).toBe(0);
    expect(forecastExpense(afterManualAnalysis)).toBe(125);

    const manualDifferentHeader = createFutureSourceTransactions(
      attachTransactionSource(parsed, source, "CSV", 1),
      "2026-09-28",
    );
    expect(manualDifferentHeader[0].id).not.toBe(automatic[0].id);
    expect(futureSourceSelectionReducer(excluded, {
      type: "sameFileReanalyzed",
      availableIds: manualDifferentHeader.map((item) => item.id),
    })).toEqual([]);
  });

  it("A 수동 매핑 재분석은 B의 미래 거래 제외를 유지한다", () => {
    const a = session("a").fileSource;
    const b = session("b").fileSource;
    const parsed = parseTransactions([
      { date: "2099-01-02", description: "미래 지출", income: 0, expense: 100, balance: null },
    ]).transactions;
    const aId = createFutureSourceTransactions(
      attachTransactionSource(parsed, a, "CSV", 0),
      "2026-09-28",
    )[0].id;
    const bId = createFutureSourceTransactions(
      attachTransactionSource(parsed, b, "CSV", 0),
      "2026-09-28",
    )[0].id;
    let aExclusions = futureSourceSelectionReducer([], { type: "setIncluded", id: aId, included: false });
    const bExclusions = futureSourceSelectionReducer([], { type: "setIncluded", id: bId, included: false });

    aExclusions = futureSourceSelectionReducer(aExclusions, { type: "manualMappingReanalyzed" });

    expect(aExclusions).toEqual([]);
    expect(bExclusions).toEqual([bId]);
    expect(aId).not.toBe(bId);
  });
});
