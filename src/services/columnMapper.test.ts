import { describe, expect, it } from "vitest";

import { mapColumn, mapColumns } from "./columnMapper";

describe("columnMapper", () => {
  it("구분과 입출금구분을 서로 다른 컬럼으로 매핑한다", () => {
    expect(mapColumn("구분")).toMatchObject({
      standardName: "category",
      confidence: "high",
      matchStatus: "mapped",
    });
    expect(mapColumn("입출금구분")).toMatchObject({
      standardName: "direction",
      confidence: "high",
      matchStatus: "mapped",
    });
  });

  it.each([
    "거래구분",
    "입출금",
    "입출금유형",
    "입출구분",
    "거래유형",
    "수입지출구분",
    "수입지출유형",
    "direction",
    "transaction_direction",
    "inout",
    "inouttype",
    "incomeexpense",
    "debitcredit",
  ])("방향 헤더 %s를 인식한다", (header) => {
    expect(mapColumn(header).standardName).toBe("direction");
  });

  it("부분 일치에서는 가장 긴 후보를 우선한다", () => {
    expect(mapColumn("입출금구분상세")).toMatchObject({
      standardName: "direction",
      confidence: "medium",
      matchStatus: "mapped",
    });
  });

  it("같은 길이의 서로 다른 부분 일치는 모호하게 처리한다", () => {
    expect(mapColumn("depositexpense")).toMatchObject({
      standardName: "unknown",
      confidence: "low",
      matchStatus: "ambiguous",
    });
  });

  it("각 원본 컬럼에 하나의 매핑 결과만 반환한다", () => {
    const mappings = mapColumns(["거래일", "금액", "입출금구분"]);

    expect(mappings).toHaveLength(3);
    expect(mappings.map((mapping) => mapping.standardName)).toEqual([
      "date",
      "amount",
      "direction",
    ]);
  });

  it.each(["입금자명", "입금은행", "입금메모"])(
    "%s를 입금액으로 오인식하지 않는다",
    (header) => {
      expect(mapColumn(header).standardName).not.toBe("income");
    },
  );

  it.each(["구분", "유형", "type"])(
    "일반 헤더 %s는 실제 방향값이 있을 때만 방향으로 확정한다",
    (header) => {
      const rows = [
        { 금액: 500000, [header]: "입금" },
        { 금액: 700000, [header]: "출금" },
      ];
      const mappings = mapColumns(["금액", header], rows);

      expect(
        mappings.find((mapping) => mapping.originalName === header),
      ).toMatchObject({
        standardName: "direction",
        confidence: "medium",
        matchStatus: "mapped",
      });
    },
  );

  it("일반 구분 헤더의 값이 방향 동의어가 아니면 기존 분류 매핑을 유지한다", () => {
    const mappings = mapColumns(
      ["금액", "구분"],
      [{ 금액: -1000, 구분: "교통비" }],
    );

    expect(
      mappings.find((mapping) => mapping.originalName === "구분"),
    ).toMatchObject({ standardName: "category" });
  });

  it("일반 구분 헤더에 일부 방향값이 있으면 알 수 없는 행도 검증할 수 있게 방향으로 매핑한다", () => {
    const rows = [
      { 금액: 1000, 구분: "입금" },
      { 금액: 500, 구분: "기타" },
    ];
    const mappings = mapColumns(["금액", "구분"], rows);

    expect(
      mappings.find((mapping) => mapping.originalName === "구분"),
    ).toMatchObject({ standardName: "direction" });
  });
});
