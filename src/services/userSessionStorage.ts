import type { ForecastScenario } from "./forecastScenario";
import type { ScheduledTransaction } from "./scheduledTransaction";

export const USER_SESSION_STORAGE_KEY =
  "finance-assistant:user-session:v1";
export const USER_SESSION_VERSION = 1 as const;

export interface UserFileSession {
  selectedScenario: ForecastScenario;
  scheduledTransactions: ScheduledTransaction[];
}

export interface UserSessionState {
  version: typeof USER_SESSION_VERSION;
  files: Record<string, UserFileSession>;
  lastFileName?: string;
}

export interface UserSessionLoadResult {
  state: UserSessionState;
  storageAvailable: boolean;
}

export interface UserFileSessionLoadResult {
  session: UserFileSession;
  exists: boolean;
  storageAvailable: boolean;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createDefaultUserFileSession(): UserFileSession {
  return {
    selectedScenario: "base",
    scheduledTransactions: [],
  };
}

export function createDefaultUserSession(): UserSessionState {
  return {
    version: USER_SESSION_VERSION,
    files: {},
  };
}

function getBrowserStorage(): StorageAdapter | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(
  storage: StorageAdapter | null | undefined,
): StorageAdapter | null {
  return storage === undefined ? getBrowserStorage() : storage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isForecastScenario(value: unknown): value is ForecastScenario {
  return (
    value === "conservative" ||
    value === "base" ||
    value === "optimistic"
  );
}

export function isValidScheduledTransaction(
  value: unknown,
): value is ScheduledTransaction {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.description === "string" &&
    (value.type === "income" || value.type === "expense") &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    value.amount >= 0
  );
}

function parseUserFileSession(value: unknown): UserFileSession | null {
  if (
    !isRecord(value) ||
    !isForecastScenario(value.selectedScenario) ||
    !Array.isArray(value.scheduledTransactions)
  ) {
    return null;
  }

  return {
    selectedScenario: value.selectedScenario,
    scheduledTransactions: value.scheduledTransactions
      .filter(isValidScheduledTransaction)
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        type: transaction.type,
        amount: transaction.amount,
      })),
  };
}

function parseUserSession(value: unknown): UserSessionState | null {
  if (
    !isRecord(value) ||
    value.version !== USER_SESSION_VERSION ||
    !isRecord(value.files)
  ) {
    return null;
  }

  const validFiles = Object.entries(value.files).flatMap(
    ([fileName, fileSession]) => {
      if (fileName.trim() === "") {
        return [];
      }

      const parsedFileSession = parseUserFileSession(fileSession);

      return parsedFileSession ? [[fileName, parsedFileSession] as const] : [];
    },
  );
  const state: UserSessionState = {
    version: USER_SESSION_VERSION,
    files: Object.fromEntries(validFiles),
  };

  if (typeof value.lastFileName === "string") {
    state.lastFileName = value.lastFileName;
  }

  return state;
}

function removeInvalidStoredSession(storage: StorageAdapter): void {
  try {
    storage.removeItem(USER_SESSION_STORAGE_KEY);
  } catch {
    // 손상된 값을 제거하지 못해도 앱 분석 기능은 계속 사용할 수 있다.
  }
}

export function loadUserSession(
  storage?: StorageAdapter | null,
): UserSessionLoadResult {
  const resolvedStorage = resolveStorage(storage);

  if (!resolvedStorage) {
    return {
      state: createDefaultUserSession(),
      storageAvailable: false,
    };
  }

  let storedValue: string | null;

  try {
    storedValue = resolvedStorage.getItem(USER_SESSION_STORAGE_KEY);
  } catch {
    return {
      state: createDefaultUserSession(),
      storageAvailable: false,
    };
  }

  if (storedValue === null) {
    return {
      state: createDefaultUserSession(),
      storageAvailable: true,
    };
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(storedValue);
  } catch {
    removeInvalidStoredSession(resolvedStorage);

    return {
      state: createDefaultUserSession(),
      storageAvailable: true,
    };
  }

  const parsedState = parseUserSession(parsedValue);

  if (!parsedState) {
    removeInvalidStoredSession(resolvedStorage);

    return {
      state: createDefaultUserSession(),
      storageAvailable: true,
    };
  }

  return {
    state: parsedState,
    storageAvailable: true,
  };
}

export function saveUserSession(
  state: UserSessionState,
  storage?: StorageAdapter | null,
): boolean {
  const resolvedStorage = resolveStorage(storage);

  if (!resolvedStorage) {
    return false;
  }

  const safeFiles = Object.entries(state.files).flatMap(
    ([fileName, fileSession]) => {
      const parsedFileSession = parseUserFileSession(fileSession);

      return parsedFileSession ? [[fileName, parsedFileSession] as const] : [];
    },
  );
  const safeState: UserSessionState = {
    version: USER_SESSION_VERSION,
    files: Object.fromEntries(safeFiles),
  };

  if (typeof state.lastFileName === "string") {
    safeState.lastFileName = state.lastFileName;
  }

  try {
    resolvedStorage.setItem(
      USER_SESSION_STORAGE_KEY,
      JSON.stringify(safeState),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadUserFileSession(
  fileName: string,
  storage?: StorageAdapter | null,
): UserFileSessionLoadResult {
  const loaded = loadUserSession(storage);
  const storedFileSession = loaded.state.files[fileName];

  return {
    session: storedFileSession
      ? {
          selectedScenario: storedFileSession.selectedScenario,
          scheduledTransactions: storedFileSession.scheduledTransactions.map(
            (transaction) => ({ ...transaction }),
          ),
        }
      : createDefaultUserFileSession(),
    exists: storedFileSession !== undefined,
    storageAvailable: loaded.storageAvailable,
  };
}

export function saveUserFileSession(
  fileName: string,
  fileSession: UserFileSession,
  storage?: StorageAdapter | null,
): boolean {
  const loaded = loadUserSession(storage);

  if (!loaded.storageAvailable) {
    return false;
  }

  return saveUserSession(
    {
      version: USER_SESSION_VERSION,
      files: {
        ...loaded.state.files,
        [fileName]: {
          selectedScenario: fileSession.selectedScenario,
          scheduledTransactions: fileSession.scheduledTransactions.map(
            (transaction) => ({ ...transaction }),
          ),
        },
      },
      lastFileName: fileName,
    },
    storage,
  );
}

export function clearUserSession(
  fileName: string,
  storage?: StorageAdapter | null,
): boolean {
  const loaded = loadUserSession(storage);

  if (!loaded.storageAvailable) {
    return false;
  }

  const remainingFiles = Object.fromEntries(
    Object.entries(loaded.state.files).filter(
      ([storedFileName]) => storedFileName !== fileName,
    ),
  );

  if (Object.keys(remainingFiles).length === 0) {
    const resolvedStorage = resolveStorage(storage);

    if (!resolvedStorage) {
      return false;
    }

    try {
      resolvedStorage.removeItem(USER_SESSION_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  const nextState: UserSessionState = {
    version: USER_SESSION_VERSION,
    files: remainingFiles,
  };

  if (
    loaded.state.lastFileName &&
    loaded.state.lastFileName !== fileName
  ) {
    nextState.lastFileName = loaded.state.lastFileName;
  }

  return saveUserSession(nextState, storage);
}
