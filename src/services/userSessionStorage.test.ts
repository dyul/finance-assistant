import { describe, expect, it } from "vitest";

import {
  USER_SESSION_STORAGE_KEY,
  clearUserSession,
  createDefaultUserSession,
  loadUserFileSession,
  loadUserSession,
  saveUserFileSession,
  saveUserSession,
  type StorageAdapter,
  type UserFileSession,
} from "./userSessionStorage";

class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const income = {
  id: "scheduled-income",
  date: "2026-05-10",
  description: "거래처 입금",
  type: "income",
  amount: 500_000,
} as const;

describe("사용자 Forecast 설정 저장", () => {
  it("저장값이 없으면 기준 시나리오와 빈 예정거래를 제공한다", () => {
    const storage = new MemoryStorage();

    expect(loadUserSession(storage)).toEqual({
      state: createDefaultUserSession(),
      storageAvailable: true,
    });
    expect(loadUserFileSession("A회사.xlsx", storage)).toEqual({
      session: {
        selectedScenario: "base",
        scheduledTransactions: [],
      },
      exists: false,
      storageAvailable: true,
    });
  });

  it("파일 설정을 저장한 뒤 동일한 값과 마지막 파일명을 복원한다", () => {
    const storage = new MemoryStorage();

    expect(
      saveUserFileSession(
        "A회사.xlsx",
        {
          selectedScenario: "optimistic",
          scheduledTransactions: [income],
        },
        storage,
      ),
    ).toBe(true);

    expect(loadUserFileSession("A회사.xlsx", storage).session).toEqual({
      selectedScenario: "optimistic",
      scheduledTransactions: [income],
    });
    expect(loadUserSession(storage).state.lastFileName).toBe(
      "A회사.xlsx",
    );
  });

  it("손상된 JSON은 제거하고 기본값으로 안전하게 복구한다", () => {
    const storage = new MemoryStorage();
    storage.setItem(USER_SESSION_STORAGE_KEY, "{invalid-json");

    expect(loadUserSession(storage)).toEqual({
      state: createDefaultUserSession(),
      storageAvailable: true,
    });
    expect(storage.getItem(USER_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("잘못된 예정거래만 제외하고 유효한 항목은 유지한다", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      USER_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        files: {
          "A회사.xlsx": {
            selectedScenario: "base",
            scheduledTransactions: [
              income,
              { ...income, id: 123 },
              { ...income, id: "negative", amount: -1 },
              { ...income, id: "wrong-type", type: "unknown" },
            ],
          },
        },
      }),
    );

    expect(
      loadUserFileSession("A회사.xlsx", storage).session
        .scheduledTransactions,
    ).toEqual([income]);
  });

  it("알 수 없는 버전은 기본값으로 복구한다", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      USER_SESSION_STORAGE_KEY,
      JSON.stringify({ version: 2, files: {} }),
    );

    expect(loadUserSession(storage).state).toEqual(
      createDefaultUserSession(),
    );
  });

  it("파일 A와 파일 B의 설정을 서로 섞지 않고 다시 복원한다", () => {
    const storage = new MemoryStorage();
    saveUserFileSession(
      "A회사.xlsx",
      {
        selectedScenario: "optimistic",
        scheduledTransactions: [income],
      },
      storage,
    );
    saveUserFileSession(
      "B회사.xlsx",
      {
        selectedScenario: "base",
        scheduledTransactions: [],
      },
      storage,
    );

    expect(loadUserFileSession("B회사.xlsx", storage).session).toEqual({
      selectedScenario: "base",
      scheduledTransactions: [],
    });
    expect(loadUserFileSession("A회사.xlsx", storage).session).toEqual({
      selectedScenario: "optimistic",
      scheduledTransactions: [income],
    });
  });

  it("예정거래 추가·삭제와 시나리오 변경을 최신 상태로 저장한다", () => {
    const storage = new MemoryStorage();

    saveUserFileSession(
      "A회사.xlsx",
      { selectedScenario: "base", scheduledTransactions: [income] },
      storage,
    );
    expect(
      loadUserFileSession("A회사.xlsx", storage).session
        .scheduledTransactions,
    ).toEqual([income]);

    saveUserFileSession(
      "A회사.xlsx",
      { selectedScenario: "optimistic", scheduledTransactions: [] },
      storage,
    );
    expect(loadUserFileSession("A회사.xlsx", storage).session).toEqual({
      selectedScenario: "optimistic",
      scheduledTransactions: [],
    });
  });

  it("현재 파일 설정만 초기화하고 다른 파일 설정은 유지한다", () => {
    const storage = new MemoryStorage();
    saveUserFileSession(
      "A회사.xlsx",
      {
        selectedScenario: "optimistic",
        scheduledTransactions: [income],
      },
      storage,
    );
    saveUserFileSession(
      "B회사.xlsx",
      {
        selectedScenario: "conservative",
        scheduledTransactions: [],
      },
      storage,
    );

    expect(clearUserSession("A회사.xlsx", storage)).toBe(true);
    expect(loadUserFileSession("A회사.xlsx", storage).exists).toBe(false);
    expect(loadUserFileSession("B회사.xlsx", storage).session).toEqual({
      selectedScenario: "conservative",
      scheduledTransactions: [],
    });
  });

  it("마지막 파일 설정을 초기화하면 저장 key도 제거한다", () => {
    const storage = new MemoryStorage();
    saveUserFileSession(
      "A회사.xlsx",
      {
        selectedScenario: "optimistic",
        scheduledTransactions: [income],
      },
      storage,
    );

    expect(clearUserSession("A회사.xlsx", storage)).toBe(true);
    expect(storage.getItem(USER_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("저장소 접근이 실패해도 기본값을 반환하고 예외를 전파하지 않는다", () => {
    const unavailableStorage: StorageAdapter = {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {
        throw new Error("storage unavailable");
      },
      removeItem() {
        throw new Error("storage unavailable");
      },
    };

    expect(loadUserSession(unavailableStorage)).toEqual({
      state: createDefaultUserSession(),
      storageAvailable: false,
    });
    expect(
      saveUserFileSession(
        "A회사.xlsx",
        { selectedScenario: "base", scheduledTransactions: [] },
        unavailableStorage,
      ),
    ).toBe(false);
    expect(clearUserSession("A회사.xlsx", unavailableStorage)).toBe(false);
  });

  it("허용하지 않은 원본 거래와 Forecast 결과는 payload에 저장하지 않는다", () => {
    const storage = new MemoryStorage();
    const unsafeScheduledTransaction = {
      ...income,
      originalExcelRow: { accountNumber: "저장하면 안 되는 원본 값" },
    };
    const unsafeFileSession: UserFileSession & {
      transactions: Array<{ description: string }>;
      forecasts: Array<{ expectedEndingBalance: number }>;
      manualMapping: { sheetName: string; dateColumn: string };
      financialSummary: { totalIncome: number };
      cashRisk: { requiredCashBuffer: number };
      actionGuide: Array<{ action: string }>;
    } = {
      selectedScenario: "base",
      scheduledTransactions: [unsafeScheduledTransaction],
      transactions: [{ description: "원본 거래 비공개" }],
      forecasts: [{ expectedEndingBalance: 123_456 }],
      manualMapping: { sheetName: "거래내역", dateColumn: "거래일" },
      financialSummary: { totalIncome: 9_999_999 },
      cashRisk: { requiredCashBuffer: 777_777 },
      actionGuide: [{ action: "저장하면 안 되는 추천 행동" }],
    };

    saveUserSession(
      {
        version: 1,
        files: { "A회사.xlsx": unsafeFileSession },
        lastFileName: "A회사.xlsx",
      },
      storage,
    );

    const payload = storage.getItem(USER_SESSION_STORAGE_KEY) ?? "";

    expect(payload).not.toContain("transactions");
    expect(payload).not.toContain("forecasts");
    expect(payload).not.toContain("원본 거래 비공개");
    expect(payload).not.toContain("expectedEndingBalance");
    expect(payload).not.toContain("originalExcelRow");
    expect(payload).not.toContain("저장하면 안 되는 원본 값");
    expect(payload).not.toContain("manualMapping");
    expect(payload).not.toContain("financialSummary");
    expect(payload).not.toContain("totalIncome");
    expect(payload).not.toContain("cashRisk");
    expect(payload).not.toContain("requiredCashBuffer");
    expect(payload).not.toContain("actionGuide");
    expect(payload).not.toContain("저장하면 안 되는 추천 행동");
    expect(payload).toContain("scheduledTransactions");
    expect(payload).toContain("거래처 입금");
  });
});
