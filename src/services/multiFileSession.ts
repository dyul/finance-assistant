import type { Transaction } from "./transactionParser";
import { getUploadFileType, MAX_EXCEL_FILE_SIZE_BYTES } from "./excelUploadValidation";
import type { UploadFileType } from "./excelUploadValidation";

export const MAX_SESSION_FILES = 5;
export const MAX_SESSION_SIZE_BYTES = 25 * 1024 * 1024;

export interface FileSource {
  id: string;
  displayName: string;
  sizeBytes: number;
  sourceType: UploadFileType;
  selectionId: string;
}

export type FileAnalysisStatus = "loading" | "ready" | "needs_mapping" | "error";

export interface FileAnalysisSession {
  fileSource: FileSource;
  file: File;
  status: FileAnalysisStatus;
  transactionCount: number;
  error: string | null;
}

export interface MultiFileState {
  sessions: FileAnalysisSession[];
  activeFileSourceId: string | null;
}

export type MultiFileAction =
  | { type: "add"; sessions: FileAnalysisSession[] }
  | { type: "update"; id: string; status: FileAnalysisStatus; transactionCount: number; error: string | null }
  | { type: "select"; id: string }
  | { type: "remove"; id: string }
  | { type: "reset" };

export const initialMultiFileState: MultiFileState = {
  sessions: [],
  activeFileSourceId: null,
};

export function multiFileReducer(state: MultiFileState, action: MultiFileAction): MultiFileState {
  switch (action.type) {
    case "add":
      return {
        sessions: [...state.sessions, ...action.sessions],
        activeFileSourceId: state.activeFileSourceId ?? action.sessions[0]?.fileSource.id ?? null,
      };
    case "update":
      if (!state.sessions.some((session) => session.fileSource.id === action.id)) return state;
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.fileSource.id === action.id
            ? { ...session, status: action.status, transactionCount: action.transactionCount, error: action.error }
            : session,
        ),
      };
    case "select":
      return state.sessions.some((session) => session.fileSource.id === action.id)
        ? { ...state, activeFileSourceId: action.id }
        : state;
    case "remove": {
      const removedIndex = state.sessions.findIndex((session) => session.fileSource.id === action.id);
      if (removedIndex < 0) return state;
      const sessions = state.sessions.filter((session) => session.fileSource.id !== action.id);
      return {
        sessions,
        activeFileSourceId: state.activeFileSourceId === action.id
          ? sessions[removedIndex]?.fileSource.id ?? sessions[0]?.fileSource.id ?? null
          : state.activeFileSourceId,
      };
    }
    case "reset":
      return initialMultiFileState;
  }
}

export interface UploadAdmission {
  accepted: FileAnalysisSession[];
  rejected: string[];
}

/** Files are accepted in picker order; one rejected file never blocks a later valid file. */
export function admitFiles(
  files: readonly File[],
  existing: readonly FileAnalysisSession[],
  createId: () => string,
): UploadAdmission {
  const accepted: FileAnalysisSession[] = [];
  const rejected: string[] = [];
  let totalBytes = existing.reduce((sum, session) => sum + session.fileSource.sizeBytes, 0);

  for (const file of files) {
    const sourceType = getUploadFileType(file.name);
    if (!sourceType) {
      rejected.push(`${file.name}: .xlsx, .xls, .csv 파일만 추가할 수 있습니다.`);
    } else if (file.size > MAX_EXCEL_FILE_SIZE_BYTES) {
      rejected.push(`${file.name}: 파일당 최대 10MB를 초과했습니다.`);
    } else if (existing.length + accepted.length >= MAX_SESSION_FILES) {
      rejected.push(`${file.name}: 최대 ${MAX_SESSION_FILES}개 파일까지 추가할 수 있습니다.`);
    } else if (totalBytes + file.size > MAX_SESSION_SIZE_BYTES) {
      rejected.push(`${file.name}: 전체 파일 크기 최대 25MB를 초과했습니다.`);
    } else {
      const id = createId();
      accepted.push({
        fileSource: {
          id,
          displayName: file.name,
          sizeBytes: file.size,
          sourceType,
          selectionId: `${id}:selection-0`,
        },
        file,
        status: "loading",
        transactionCount: 0,
        error: null,
      });
      totalBytes += file.size;
    }
  }
  return { accepted, rejected };
}

export interface SourceTransaction extends Transaction {
  transactionSourceId: string;
  source: {
    fileSourceId: string;
    sheetSelectionId: string;
    accountSourceId: null;
    sheetName: string;
    headerRowIndex: number;
    sourceRowIndex: number;
  };
}

/** Copies parsed rows so chronology fields and the parser's sourceRowIndex remain untouched. */
export function attachTransactionSource(
  transactions: readonly Transaction[],
  fileSource: FileSource,
  sheetName: string,
  headerRowIndex: number,
): SourceTransaction[] {
  return transactions.map((transaction, index) => {
    const sourceRowIndex = transaction.sourceRowIndex ?? index;
    return {
      ...transaction,
      transactionSourceId: JSON.stringify([
        fileSource.id,
        fileSource.selectionId,
        sheetName,
        headerRowIndex,
        sourceRowIndex,
      ]),
      source: {
        fileSourceId: fileSource.id,
        sheetSelectionId: fileSource.selectionId,
        accountSourceId: null,
        sheetName,
        headerRowIndex,
        sourceRowIndex,
      },
    };
  });
}
