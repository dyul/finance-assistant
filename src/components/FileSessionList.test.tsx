import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FileSessionList from "./FileSessionList";
import type { FileAnalysisSession } from "../services/multiFileSession";

function session(id: string, status: FileAnalysisSession["status"], count = 0): FileAnalysisSession {
  return {
    fileSource: { id, displayName: "거래내역.csv", sizeBytes: 10, sourceType: "csv", selectionId: `${id}:selection-0` },
    file: { name: "거래내역.csv", size: 10 } as File,
    status,
    transactionCount: count,
    error: status === "error" ? "파일을 읽지 못했습니다." : null,
  };
}

describe("파일 목록", () => {
  it("동일 파일명도 순서와 상태로 구별하고 선택·제거 버튼을 제공한다", () => {
    const markup = renderToStaticMarkup(
      <FileSessionList
        sessions={[session("a", "ready", 10), session("b", "needs_mapping"), session("c", "error")]}
        activeFileSourceId="a"
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(markup).toContain("거래내역 파일 3개");
    expect(markup).toContain("분석 완료 · 10건");
    expect(markup).toContain("직접 설정 필요");
    expect(markup).toContain("파일을 읽지 못했습니다.");
    expect(markup).toContain('aria-label="1번째 거래내역.csv 보기"');
    expect(markup).toContain('aria-label="2번째 거래내역.csv 설정"');
    expect(markup).toContain('aria-label="3번째 거래내역.csv 제거"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("break-all");
    expect(markup).toContain("전체 초기화");
    expect(markup).toContain("현금흐름을 합산하지 않습니다");
  });
});
