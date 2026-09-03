import { describe, expect, it } from "vitest";

import { mapColumns } from "./columnMapper";
import {
  CsvLoadError,
  createCsvDataSource,
  decodeCsv,
  loadCsvDataSource,
  parseCsvText,
} from "./csvDataSource";
import { calculateFinancialSummary } from "./financialEngine";
import { getLatestBalance } from "./forecastEngine";
import {
  convertManualMappingToColumnMappings,
  createManualMappingPrefill,
  validateManualMapping,
} from "./manualMapping";
import { standardizeTransactionRows } from "./transactionRowStandardizer";
import { parseTransactions } from "./transactionParser";
import { detectTransactionSheet } from "./transactionSheetDetector";

function toArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function withUtf8Bom(text: string): ArrayBuffer {
  const content = new TextEncoder().encode(text);
  const bytes = new Uint8Array(content.length + 3);

  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(content, 3);
  return bytes.buffer;
}

function analyzeCsv(text: string) {
  const source = loadCsvDataSource(toArrayBuffer(text));
  const detection = detectTransactionSheet(source.getSheetCandidates());

  if (!detection) {
    throw new Error("csv-detection-failed");
  }

  const preview = source.getPreview(
    detection.sheetName,
    detection.headerRowIndex,
  );
  const rows = source.getRows(
    detection.sheetName,
    detection.headerRowIndex,
  );
  const mappings = mapColumns(preview.columns, rows);
  const parsed = parseTransactions(
    standardizeTransactionRows(rows, mappings),
  );

  return {
    source,
    detection,
    rows,
    mappings,
    parsed,
    summary: calculateFinancialSummary(parsed.transactions),
  };
}

function csvWithHeaderAt(headerRowNumber: number): string {
  const descriptions = Array.from(
    { length: headerRowNumber - 1 },
    (_, index) => `조회 안내 ${index + 1}`,
  );

  return [
    ...descriptions,
    "거래일,적요,입금액,출금액,잔액",
    "2026-01-03,매출,500000,,500000",
    "2026-01-04,월세,,300000,200000",
  ].join("\n");
}

describe("CSV decoding과 문법", () => {
  it("UTF-8과 UTF-8 BOM을 구분 없이 읽는다", () => {
    const text = "거래일,적요\n2026-01-03,매출";

    expect(decodeCsv(toArrayBuffer(text))).toEqual({
      text,
      encoding: "utf-8",
    });
    expect(decodeCsv(withUtf8Bom(text))).toEqual({
      text,
      encoding: "utf-8",
    });
  });

  it.each([
    ["LF", "a,b\n1,2"],
    ["CRLF", "a,b\r\n1,2"],
  ])("%s 줄바꿈을 행으로 분리한다", (_label, text) => {
    expect(parseCsvText(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("quoted comma와 escaped quote를 필드 값으로 유지한다", () => {
    expect(
      parseCsvText(
        '거래일,적요,금액\n2026-01-03,"온라인몰, 1월 정산","900,000"\n2026-01-04,"ABC ""특별"" 정산",500000',
      ),
    ).toEqual([
      ["거래일", "적요", "금액"],
      ["2026-01-03", "온라인몰, 1월 정산", "900,000"],
      ["2026-01-04", 'ABC "특별" 정산', "500000"],
    ]);
  });

  it("빈 셀은 유지하고 중간 빈 행은 데이터 행에서 제외한다", () => {
    const source = loadCsvDataSource(
      toArrayBuffer(
        "거래일,적요,입금액,출금액,잔액\n2026-01-03,매출,500000,,500000\n,,,,\n2026-01-04,월세,,300000,200000\n",
      ),
    );

    expect(source.getRows("CSV", 0)).toEqual([
      {
        거래일: "2026-01-03",
        적요: "매출",
        입금액: "500000",
        출금액: "",
        잔액: "500000",
      },
      {
        거래일: "2026-01-04",
        적요: "월세",
        입금액: "",
        출금액: "300000",
        잔액: "200000",
      },
    ]);
  });

  it("WHATWG euc-kr decoder로 CP949 한글 CSV를 fallback 처리한다", () => {
    const cp949Bytes = Uint8Array.from([
      176, 197, 183, 161, 192, 207, 44, 192, 251, 191, 228, 44, 192, 212,
      177, 221, 190, 215, 44, 195, 226, 177, 221, 190, 215, 44, 192, 220,
      190, 215, 13, 10, 50, 48, 50, 54, 45, 48, 49, 45, 48, 51, 44, 184,
      197, 195, 226, 44, 53, 48, 48, 48, 48, 48, 44, 44, 53, 48, 48, 48,
      48, 48,
    ]);
    const decoded = decodeCsv(cp949Bytes.buffer);

    expect(decoded.encoding).toBe("euc-kr");
    expect(decoded.text).toContain("거래일,적요,입금액,출금액,잔액");
    expect(decoded.text).toContain("매출");
  });

  it("두 strict decoder로 읽을 수 없는 바이트와 깨진 문자를 차단한다", () => {
    expect(() => decodeCsv(Uint8Array.from([0x80, 0x8e]).buffer)).toThrow(
      CsvLoadError,
    );
    expect(() => decodeCsv(toArrayBuffer("���,a,b"))).toThrow(
      CsvLoadError,
    );
  });

  it("닫히지 않은 quote와 comma가 아닌 delimiter를 blocking 대상으로 둔다", () => {
    expect(() => parseCsvText('a,b\n"열리지않음,1')).toThrow(
      CsvLoadError,
    );
    expect(() => parseCsvText("a;b\n1;2")).toThrow(CsvLoadError);
  });
});

describe("CSV header와 직접 설정 adapter", () => {
  it("1행 헤더를 자동 탐지한다", () => {
    expect(analyzeCsv(csvWithHeaderAt(1)).detection.headerRowIndex).toBe(0);
  });

  it("설명 행 뒤의 실제 헤더를 자동 탐지한다", () => {
    expect(analyzeCsv(csvWithHeaderAt(5)).detection.headerRowIndex).toBe(4);
  });

  it("30행 헤더까지 자동 탐지한다", () => {
    expect(analyzeCsv(csvWithHeaderAt(30)).detection.headerRowIndex).toBe(29);
  });

  it.each([31, 50, 100])(
    "%i행 헤더는 fallback 자동 탐지하며 기존 직접 설정도 유지한다",
    (headerRowNumber) => {
      const source = loadCsvDataSource(
        toArrayBuffer(csvWithHeaderAt(headerRowNumber)),
      );
      const headerRowIndex = headerRowNumber - 1;

      expect(
        detectTransactionSheet(source.getSheetCandidates()),
      ).toMatchObject({ headerRowIndex });

      const preview = source.getPreview("CSV", headerRowIndex);
      const automaticMappings = mapColumns(preview.columns, preview.rows);
      const mapping = createManualMappingPrefill(
        "CSV",
        headerRowIndex,
        automaticMappings,
      );

      expect(
        validateManualMapping(mapping, {
          sheetNames: source.sheetNames,
          columns: preview.columns,
          headerRowLimit: preview.headerRowLimit,
        }),
      ).toEqual([]);

      const rows = source.getRows("CSV", headerRowIndex);
      const parsed = parseTransactions(
        standardizeTransactionRows(
          rows,
          convertManualMappingToColumnMappings(mapping, preview.columns),
        ),
      );

      expect(calculateFinancialSummary(parsed.transactions)).toMatchObject({
        totalIncome: 500_000,
        totalExpense: 300_000,
        netCashFlow: 200_000,
        transactionCount: 2,
      });
    },
  );

  it("101행 헤더는 기존 100행 직접 설정 범위 밖으로 둔다", () => {
    const source = loadCsvDataSource(toArrayBuffer(csvWithHeaderAt(101)));

    expect(detectTransactionSheet(source.getSheetCandidates())).toBeNull();
    expect(source.getPreview("CSV", 100)).toEqual({
      columns: [],
      rows: [],
      headerRowLimit: 100,
    });
  });
});

describe("CSV 공통 거래 분석 pipeline", () => {
  it("분리 입금·출금 구조를 기존 계산에 연결한다", () => {
    const result = analyzeCsv(
      "거래일,적요,입금액,출금액,잔액\n2026-01-03,매출,500000,,500000\n2026-01-04,월세,,300000,200000",
    );

    expect(result.summary).toMatchObject({
      totalIncome: 500_000,
      totalExpense: 300_000,
      netCashFlow: 200_000,
      transactionCount: 2,
    });
  });

  it("금액+거래구분 구조를 기존 방향 parser에 연결한다", () => {
    const result = analyzeCsv(
      "거래일,적요,금액,거래구분,잔액\n2026-01-03,매출,500000,입금,500000\n2026-01-04,월세,300000,출금,200000",
    );

    expect(result.detection.amountStructure).toBe("amountDirection");
    expect(result.summary.netCashFlow).toBe(200_000);
  });

  it("부호형 금액 구조의 양수와 음수를 기존 parser에 연결한다", () => {
    const result = analyzeCsv(
      "거래일,적요,금액,잔액\n2026-01-03,매출,500000,500000\n2026-01-04,월세,-300000,200000",
    );

    expect(result.detection.amountStructure).toBe("signedAmount");
    expect(result.summary.netCashFlow).toBe(200_000);
  });

  it.each([
    "2026-01-03",
    "2026/1/3",
    "2026.1.3",
    "2026년 1월 3일",
    "20260103",
  ])("CSV 문자열 날짜 %s를 기존 정책으로 정규화한다", (date) => {
    expect(
      analyzeCsv(
        `거래일,적요,입금액,출금액,잔액\n${date},매출,500000,,500000`,
      ).parsed.transactions[0]?.date,
    ).toBe("2026-01-03");
  });

  it("CSV 숫자 문자열을 Excel serial 날짜로 해석하지 않는다", () => {
    const source = createCsvDataSource([
      ["거래일", "적요", "입금액", "출금액", "잔액"],
      ["46000", "매출", "500000", "", "500000"],
    ]);
    const rows = source.getRows("CSV", 0);
    const mappings = mapColumns(
      source.getPreview("CSV", 0).columns,
      rows,
    );
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mappings),
    );

    expect(parsed.transactions[0]?.date).toBeNull();
    expect(parsed.invalidDateCount).toBe(1);
  });

  it.each([
    ["500000", 500_000],
    ["500,000", 500_000],
    ["500,000원", 500_000],
    ["-700000", -700_000],
    ["(700,000)", -700_000],
    ["0", 0],
  ])("CSV 금액 문자열 %s를 기존 금액 정책으로 처리한다", (amount, expected) => {
    const expenseAmount = expected < 0 ? Math.abs(expected) : 0;
    const incomeAmount = expected >= 0 ? expected : 0;
    const result = analyzeCsv(
      `거래일,적요,금액,잔액\n2026-01-03,기준,100,100\n2026-01-04,검증,"${amount}",100`,
    );
    const transaction = result.parsed.transactions[1];

    expect(transaction?.income).toBe(incomeAmount);
    expect(transaction?.expense).toBe(expenseAmount);
  });

  it("invalid date·amount·direction을 기존 partial 분류로 유지한다", () => {
    const source = createCsvDataSource([
      ["거래일", "적요", "금액", "거래구분", "잔액"],
      ["2026-01-03", "정상", "500000", "입금", "500000"],
      ["invalid date", "날짜 오류", "100000", "입금", "600000"],
      ["2026-01-05", "금액 오류", "N/A", "출금", "600000"],
      ["2026-01-06", "방향 오류", "100000", "기타", "600000"],
    ]);
    const rows = source.getRows("CSV", 0);
    const mappings = mapColumns(source.getPreview("CSV", 0).columns, rows);
    const parsed = parseTransactions(
      standardizeTransactionRows(rows, mappings),
    );

    expect(parsed.invalidDateCount).toBe(1);
    expect(parsed.invalidAmountCount).toBe(1);
    expect(parsed.unknownDirectionCount).toBe(1);
  });

  it("잔액 누락과 실제 0 잔액을 구분한다", () => {
    const missing = analyzeCsv(
      "거래일,적요,입금액,출금액\n2026-01-03,매출,500000,",
    );
    const zero = analyzeCsv(
      "거래일,적요,입금액,출금액,잔액\n2026-01-03,매출,500000,,0",
    );

    expect(getLatestBalance(missing.parsed.transactions)).toBeNull();
    expect(getLatestBalance(zero.parsed.transactions)).toBe(0);
  });

  it("유효 거래가 없는 CSV는 자동 분석 대상으로 확정하지 않는다", () => {
    const source = createCsvDataSource([
      ["거래일", "적요", "금액"],
      ["날짜미정", "오류", "금액미정"],
    ]);

    expect(detectTransactionSheet(source.getSheetCandidates())).toBeNull();
  });

  it("formula-like와 XSS 문자열을 실행하지 않고 원문 텍스트로 유지한다", () => {
    const result = analyzeCsv(
      '거래일,적요,금액,잔액\n2026-01-03,"<img src=x onerror=alert(1)>",500000,500000\n2026-01-04,"=SUM(A1:A2) +cmd @formula",-100000,400000',
    );

    expect(result.parsed.transactions.map((item) => item.description)).toEqual([
      "<img src=x onerror=alert(1)>",
      "=SUM(A1:A2) +cmd @formula",
    ]);
    expect(result.summary.netCashFlow).toBe(400_000);
  });
});
