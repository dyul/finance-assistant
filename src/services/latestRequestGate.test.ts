import { describe, expect, it } from "vitest";

import { createLatestRequestGate } from "./latestRequestGate";

describe("최신 파일 처리 요청 보호", () => {
  it("나중에 시작한 요청만 최신 결과로 인정한다", () => {
    const gate = createLatestRequestGate();
    const firstRequest = gate.begin();

    expect(gate.isLatest(firstRequest)).toBe(true);

    const secondRequest = gate.begin();

    expect(gate.isLatest(firstRequest)).toBe(false);
    expect(gate.isLatest(secondRequest)).toBe(true);
  });

  it("요청이 여러 번 겹쳐도 마지막 요청 하나만 화면 반영 대상이다", () => {
    const gate = createLatestRequestGate();
    const requestIds = [gate.begin(), gate.begin(), gate.begin()];

    expect(requestIds.map((id) => gate.isLatest(id))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("먼저 시작한 CSV가 늦게 끝나도 나중 Excel 결과만 반영한다", async () => {
    const gate = createLatestRequestGate();
    const appliedFiles: string[] = [];
    let finishCsv: () => void = () => undefined;
    const csvRead = new Promise<void>((resolve) => {
      finishCsv = resolve;
    });
    const csvRequestId = gate.begin();
    const csvTask = csvRead.then(() => {
      if (gate.isLatest(csvRequestId)) {
        appliedFiles.push("A.csv");
      }
    });

    const excelRequestId = gate.begin();

    if (gate.isLatest(excelRequestId)) {
      appliedFiles.push("B.xlsx");
    }

    finishCsv();
    await csvTask;

    expect(appliedFiles).toEqual(["B.xlsx"]);
  });
});
