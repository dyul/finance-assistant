# Multi-file / Multi-account architecture (Day 48A)

> 상태: 설계 결정. 제품 기능은 아직 구현되지 않았다. 기준 코드: `eca274a` (Day 47).
> 범위: 브라우저 세션에서 여러 Excel/CSV 입력을 다루기 위한 데이터 모델, 회계 불변식, 단계별 구현 계획.
> `N=1`은 기존 단일 파일 경로와 숫자·동작을 그대로 유지한다.

## 1. 문제, 목표, 제외 범위

현재는 한 파일을 읽어 한 분석을 만든다. 파일 여러 개를 이어 붙이면 같은 계좌의 겹친 내역이 중복되고, 계좌 A의 출금과 계좌 B의 입금이 모두 외부 지출·수입으로 계산될 수 있다. 각 파일의 마지막 잔액 하나를 고르는 것도 전체 잔액이 아니다.

목표는 파일·계좌·거래의 출처를 보존하고, 계좌의 실제 움직임(`account movement`), 선택한 파일 전체의 총 움직임(`gross movement`), 확인된 내부이체를 제외한 외부 현금흐름(`external flow`)을 서로 다른 분석 범위로 정의하는 것이다. 불완전한 출처나 잔액을 완전한 숫자로 표시하지 않는다.

이번 Day는 설계 문서만 작성한다. 다중 업로드 UI, 병합, 중복 제거, 이체 확정, 백엔드/API, 저장 방식 변경은 구현하지 않는다. 기존 사용자 화면의 기능 목록도 바꾸지 않는다.

## 2. 확인한 현재 구조와 접점

| 현재 코드 | 확인한 동작 | 다중 파일 설계에 주는 제약 |
| --- | --- | --- |
| `UploadArea.tsx` | `workbook`, 파일명, 매핑, 거래, 결과가 각각 단일 state이다. 새 파일 선택은 기존 분석을 초기화한다. | 파일별 상태 컨테이너와 파생 통합 결과가 필요하다. 비동기 완료는 현재의 최신 요청 보호와 같이 구별해야 한다. |
| `FileUploadSection.tsx` | input 한 개의 첫 파일만 읽으며 1개 파일 안내를 표시한다. | Day 48B 이후 안내와 파일 목록을 함께 수정한다. |
| `TransactionDataSource`, `transactionSheetDetector.ts` | Excel/CSV 공통 인터페이스로 후보 시트 중 한 분석 대상을 고른다. | 한 workbook의 여러 계좌 시트는 별도 분석 단위이며 48B에서 자동 통합하지 않는다. |
| `transactionParser.ts` | `Transaction`은 날짜/시각, 입출금, nullable 잔액, `sourceRowIndex`, 원본 분류, `financialNature`를 갖는다. | `sourceRowIndex`는 파서 입력 배열의 0 기반 인덱스이다. 파일 간 ID가 아니며 Excel 실제 행 번호라고 단정할 수 없다. |
| `financialEngine.ts`, `historicalPeriodAggregator.ts` | 유효 금액 거래를 집계하고 한 거래 목록에서 최신 잔액을 고른다. | 금액 집계 함수는 범위별 입력을 만들어 재사용한다. 여러 계좌의 잔액 계산에는 이 집계의 `closingBalance`를 사용하지 않는다. |
| `historicalRangeAnalyzer.ts` | 달력 날짜로 필터한 뒤 수입·지출·잔액·카테고리를 계산한다. | 이체 확정은 전체 선택 데이터에서 먼저 수행하고 범위에는 파생 외부 거래 목록을 넣는다. 범위 잔액은 별도 정책이 필요하다. |
| `cashBalanceTrend.ts` | 월별 `closingBalance`와 Forecast 시작점/월말 예상점을 그린다. 관측 공백을 보존한다. | 여러 계좌 거래를 합친 월별 단일 `closingBalance`는 통합 잔액이 아니다. |
| `forecastEngine.ts`, `recurringTransactionDetector.ts` | 반복 키는 설명·core category·입출금 방향이다. 시작 잔액이 `null`이면 Forecast 없음. | 계좌 구분과 이체 정리가 없는 반복 거래 병합은 잘못된 예측을 만든다. |
| `futureSourceTransaction.ts`, `scheduledTransaction.ts` | 미래 파일 거래 ID는 현재 배열 인덱스 기반. 직접 예정 거래는 파일명 기반 설정에 포함된다. | 미래 거래 ID와 선택 상태를 파일/계좌 출처별로 나눠야 한다. |
| `userSessionStorage.ts`, `manualBalance.ts` | 시나리오·직접 예정 거래는 파일명 키로 저장된다. 직접 입력 잔액은 세션 전용이며 파일 잔액이 우선이다. | 같은 파일명 충돌을 통합 세션에 전파하면 안 된다. 저장 범위를 확대하지 않는다. |
| `dataQualityAnalyzer.ts`, `AnalysisReport.tsx` | 품질은 거래 목록 기준, PDF는 단일 파일명·시트·요약 기준이다. | 파일별 오류와 통합 완전성 상태가 별도로 필요하다. 기존 PDF에 다중 수치를 억지로 넣지 않는다. |

현재 파일당 10 MiB 제한이 있다. 1천/5천/1만 행 성능 테스트는 존재하지만, 5~10개 파일을 동시에 분석한 성능 근거는 아직 없다.

## 3. 계층과 권장 모델 (TypeScript 제안, 구현 아님)

```text
Source: FileSource ── SheetSelection ── AccountSource
                     └── 파일/시트별 자동 또는 수동 매핑
Transaction: 기존 Transaction + 출처를 가진 불변 래퍼
Reconciliation: exact file duplicate / transaction duplicate / transfer pair
Analysis: account movement | consolidated gross | consolidated external
Presentation: 파일 상태·커버리지·완전성·경고·분석 범위
```

```ts
type FileSourceId = string;       // 업로드 인스턴스별 세션 ID, 파일명이 아님
type SheetSelectionId = string;   // 한 파일 안의 분석 대상 시트/범위 ID
type AccountSourceId = string;    // 사용자가 확인한 계좌 묶음의 세션 ID
type TransactionId = string;      // 활성 파싱 선택 내 전역 유일 ID

interface FileSource {
  id: FileSourceId;
  displayName: string;            // 표시 전용. 신원 판정에 사용하지 않음
  sizeBytes: number;
  sourceType: "excel" | "csv";
  selectionIds: SheetSelectionId[]; // 48B는 한 개만 허용
  // File/ArrayBuffer, 파싱 결과는 런타임 전용.
}

interface SheetSelection {
  id: SheetSelectionId;
  fileSourceId: FileSourceId;
  status: "uploaded" | "parsing" | "needs_mapping" | "ready" | "error";
  sheetName: string | null;
  headerRowIndex: number | null;
  mappingMode: "automatic" | "manual" | null;
  accountSourceId: AccountSourceId | null;
  errorCode?: string;
  dateCoverage: { earliest: string; latest: string } | null;
}

interface AccountSource {
  id: AccountSourceId;
  label: string | null;           // 사용자가 정한 표시명, 신원 키가 아님
  confirmation: "unassigned" | "user_confirmed";
  selectionIds: SheetSelectionId[]; // 같은 계좌의 여러 월별 export 허용
}

interface SourceTransaction {
  id: TransactionId;
  source: {
    fileSourceId: FileSourceId;
    sheetSelectionId: SheetSelectionId;
    accountSourceId: AccountSourceId | null;
    sheetName: string;            // CSV는 논리 시트 `CSV`
    headerRowIndex: number;
    sourceRowIndex: number;        // 기존 파서의 0 기반 값 그대로 유지
  };
  transaction: Readonly<Transaction>; // 기존 타입. 원본 파싱 결과를 수정하지 않음
}

interface AccountBalance {
  accountSourceId: AccountSourceId;
  value: number | null;           // 0은 유효 잔액, null은 확인 불가
  observedDate: string | null;
  observedTime: string | null;
  sourceTransactionId: TransactionId | null;
  state: "observed" | "missing" | "conflicting";
}

interface InternalTransferPair {
  id: string;
  outgoingTransactionId: TransactionId;
  incomingTransactionId: TransactionId;
  state: "confirmed";           // 모호한 후보는 pair로 만들지 않음
  matchReasons: string[];         // 예: 금액 동일, 양쪽 명시 분류, 시각 근접
}

interface ConsolidatedAnalysis {
  scope: "gross" | "external";
  sourceCompleteness: "complete" | "partial" | "unresolved";
  transactions: readonly SourceTransaction[];
  excludedDuplicateIds: ReadonlySet<TransactionId>;
  confirmedTransferPairs: readonly InternalTransferPair[];
  balance: {
    value: number | null;
    asOf: string | null;
    status: "common_asof_verified" | "mixed_dates" | "missing" | "conflicting" | "unverified";
  };
}
```

`fileSourceId`는 업로드마다 새로 만든다(예: 세션 UUID). 한 파일의 서로 다른 시트는 같은 파일 ID와 서로 다른 `SheetSelection`을 갖고 각 선택을 다른 계좌에 연결할 수 있다. 48B는 파일당 선택 시트 하나로 제한하고, 한 workbook에 여러 계좌 시트가 있는 경우 분석 범위를 명시한다. 한 시트 안에 여러 계좌 행이 섞여 있으면 현재 파서는 행별 계좌 신원을 제공하지 않으므로 지원하지 않는다. `accountSourceId`는 사용자 확인을 거친 그룹 ID이다. 파일 하나가 곧 계좌 하나라는 임시 가정은 파일 목록 표시에는 쓸 수 있어도 계좌 잔액 합산이나 이체 확정의 증거가 아니다.

거래 ID 후보는 `fileSourceId + sheetSelectionId + sheetName + headerRowIndex + sourceRowIndex`를 충돌 없는 인코딩으로 조합한다. 같은 파일명·같은 행 번호는 충돌하지 않는다. 같은 선택을 재분석할 때 세션 내 ID를 유지한다. 헤더 또는 시트를 바꾸면 파서 인덱스가 달라질 수 있으므로 해당 선택의 거래와 그에 의존하는 중복·pair·미래 거래 선택을 재생성한다. `sourceRowIndex`를 Excel 물리 행 번호로 표시하려면 별도의 매핑이 필요하다. 영구 ID나 은행 고유 거래 ID로 취급하지 않는다.

### 계좌 신원 전략 비교

| 후보 | 장점 | 위험/판정 |
| --- | --- | --- |
| 파일 하나 = 계좌 하나 | 구현이 간단하다. | 같은 계좌의 월별 파일을 여러 계좌로 오인한다. 잔액 중복 합산 위험. 분석용 확정 신원으로 사용 금지. |
| 사용자가 label 입력 | 개인정보 노출이 적고 이해하기 쉽다. | 같은 이름·오타가 가능하다. label 문자열만으로 자동 그룹화 금지. |
| 은행 metadata의 privacy-safe fingerprint | 반복 업로드의 자동 식별 가능성. | 현재 안전한 계좌번호 추출이 없고 해시도 재식별 위험이 있다. MVP 제외. 별도 개인정보 영향 검토 항목. |
| 혼합: 세션 ID + 사용자의 명시적 묶음 + 선택 label | 안전성과 사용성이 균형적이다. | 사용자 확인 단계가 필요하다. **권장 MVP**. |

UI에서는 “새 계좌” 또는 “앞서 올린 어느 계좌와 같은가”를 명시적으로 고르게 한다. label은 선택 사항이다. 확인 전에는 `unassigned`로 남긴다. 다른 계좌인지 확정되지 않은 파일 사이에서 이체 자동 확정, 계좌별 잔액 합산, 외부 현금흐름 확정값을 만들지 않는다. 전체 계좌번호는 파싱 로그, 문서, 테스트, 저장소, 분석 지표 어디에도 보존하지 않는다.

## 4. 중복과 내부이체: 다른 두 문제

중복 파일은 같은 바이트가 두 업로드 인스턴스로 들어온 경우, 중복 거래는 같은 실제 계좌 거래가 겹치는 export에 두 번 나타난 경우, 겹치는 export는 같은 계좌 파일의 날짜 범위가 겹치지만 내용은 부분적으로만 중복되는 경우다. 내부이체는 **서로 다른 계좌의 별도 입출금 두 건**이다. 중복 제거는 먼저 계좌 내에서, 이체 연결은 그다음 계좌 사이에서 수행한다. 원본 행은 삭제하지 않고 선택된 분석 목록에서 한 표현만 채택한다.

| 파일 판단 단서 | 정책 |
| --- | --- |
| 파일명 | 표시만 한다. 같은 이름도 다른 내용일 수 있다. |
| 크기·`lastModified` | 빠른 사전 검사 단서일 뿐 확정 증거가 아니다. |
| 브라우저에서 계산한 바이트 content hash | 같은 바이트 후보를 찾는 가장 강한 기본 단서. 다르면 동일 거래 일부가 있을 수 있다. 해시와 파일 내용은 세션 메모리에만 둔다. |

같은 바이트 파일을 다시 선택하면 기존 파일을 가리키거나 중복 경고를 표시한다. 같은 workbook의 서로 다른 시트를 분석하는 경우에는 파일 자체를 중복 업로드하지 않고 시트 선택으로 표현한다. 내용 해시가 다르더라도 동일 계좌의 겹치는 export인지 검사해야 한다. 해시 구현은 48B 이후로 미룬다.

거래 자동 중복 확정은 **사용자가 같은 계좌로 묶은 서로 다른 파일**에 한정한다. 양쪽에 유효한 정확한 날짜·시각, 방향, 금액, 잔액, 정규화 설명이 모두 같고 각 파일에서 해당 키가 각각 한 건인 경우만 높은 확신 후보로 삼는다. 날짜만 있거나 잔액이 없거나 같은 키가 여러 건이면 자동 제거하지 않는다. 같은 날 같은 금액의 카페 거래 두 건은 다른 거래일 수 있다. 앞으로 은행 고유 거래 ID가 안전하게 지원되면 별도 근거로 재검토한다. 자동 중복도 원본은 남기고 채택/제외 관계를 파생 데이터로 둔다. 선택한 대표 행과 출처 둘 모두 사용자가 추적할 수 있어야 한다.

### 내부이체 후보와 확정 정책

후보는 계좌 신원이 확인된 **서로 다른 두 계좌**, 유효한 반대 방향(출금 ↔ 입금), 동일한 양의 원 단위 금액을 전제로 한다. 금액 차이를 수수료라고 추정해 맞추지 않는다. 수수료가 별도 거래라면 별도 외부 지출로 남는다. `financialNature === "internal_transfer"`는 후보 신호일 뿐 확정이 아니다. 반대편 파일이 없을 수 있고, 저축 계좌로 보낸 이체는 `savings`로 분류될 수 있다.

MVP 후보 시간 정책: 양쪽에 시각이 있으면 같은 현지 달력 기준 ±10분 내 후보를 찾는다. 그중 ±5분, 같은 금액, **양쪽의 명시적인 내부이체 신호**, 경쟁 후보 없는 일대일 관계일 때만 자동 확정한다. 시간 숫자는 사용자 데이터로 검증할 운영 가설이며 근거 없이 회계 법칙으로 취급하지 않는다. 한쪽만 신호가 있거나 ±5~10분이면 검토 후보로 두고 제외하지 않는다. 시각이 한쪽이라도 없으면 같은 날짜의 후보까지만 만들고 자동 확정하지 않는다. 날짜가 자정을 건너도 양쪽 시각이 있고 차이가 5분 이내면 후보가 될 수 있다. 파일 시각에는 시간대 정보가 없으므로 기기 시간대로 재해석하지 않고 원본의 현지 벽시계 값을 비교한다.

후보가 0개면 `unmatched`, 유일한 높은 확신 후보면 `confirmed`, 동등한 상대가 2개 이상이거나 한 거래가 둘 이상의 pair에 쓰이면 `ambiguous`이다. 모호한 거래는 둘 다 외부 수입/지출에서 **제외하지 않는다**. 0~100 점수는 만들지 않는다. 향후 사용자 확인/거절 동작이 있으면 그 결정도 세션에서만 보유하고 파일 삭제·교체 시 무효화한다. 잘못 제외하는 피해를 줄이기 위해 정확도를 놓치는 이체보다 우선한다.

```text
unique transactions = confirmed duplicate를 한 표현으로 축약한 분석 목록
index income by (positive amount, local date bucket)
for each valid expense of a confirmed account:
    search only nearby date buckets and opposite-direction income
    require different confirmed account, exact amount, time policy
    mark unique strong one-to-one pairs confirmed
    leave every competing or weaker candidate ambiguous/unmatched
never mutate SourceTransaction.transaction
```

모든 거래 쌍을 비교하는 O(n²) 방식은 금지한다. 금액·날짜 bucket 인덱스를 사용하고 같은 키 후보만 비교한다. 동일 금액 거래가 매우 많으면 후보 수에 상한을 두고 자동 확정 대신 모호함을 표시한다.

### Day 47 `financialNature` 충돌 결정

Day 47의 한 enum은 `ordinary | savings | investment | debt | internal_transfer`다. “적금 계좌로 보낸 내부이체”는 저축 목적과 계좌 관계를 동시에 갖기에 한 값으로 표현할 수 없다. 최종 방향은 **경제적 성격과 이체 관계를 분리**하는 것이다.

```ts
type EconomicNature = "ordinary" | "savings" | "investment" | "debt" | "unknown";
type TransferClassification =
  | "none" | "candidate" | "ambiguous" | "confirmed_internal";
// legacy Transaction.financialNature는 단일 파일 회귀를 위해 유지.
// multi-account 해석에서 legacy internal_transfer는 후보 신호로만 읽음.
```

새 분석 래퍼에서 경제적 성격과 `transferClassification`을 파생한다. `savings`도 확인된 내부이체가 될 수 있다. 기존 `financialNature=internal_transfer`를 무조건 `ordinary`로 바꾸거나 원본 거래 값을 수정하지 않는다. `sourceCategory`/`sourceSubcategory`와 core `category`도 유지한다. Day 48B는 이 분리를 문서상의 계약으로만 다루고, 실제 reconciliation 단계에서 타입/표시 이행과 단일 파일 회귀 테스트를 수행한다.

## 5. 분석 범위와 회계 의미

| 범위 | 포함 거래 | 수입/지출과 건수 의미 |
| --- | --- | --- |
| 파일 원본 | 해당 파일의 파싱 결과 전체 | 출처 확인용. 중복 행도 보인다. |
| 계좌 움직임 | 같은 계좌 파일의 확인된 중복을 한 번만 채택 | 실제 입출금. 내부이체 양쪽은 각 계좌에서 유지. |
| 통합 gross | 모든 계좌의 중복 정리 후 입출금 | **계좌 입출금 총액**. 내부이체 양쪽 모두 들어 있다. 외부 수입/소비라고 부르지 않는다. |
| 통합 external | gross에서 확인된 내부이체 pair 양쪽 제외 | 사용자 전체 기준 외부 수입·지출·순현금흐름. 모호하거나 한쪽만 있는 이체는 남기고 경고한다. |

별도로 `raw row count`, `unique account movement count`, `external transaction count`, `confirmed transfer pair count`, `ambiguous count`를 표시 모델에서 구분한다. `FinancialSummary.transactionCount` 하나를 문맥 없이 통합 거래 건수로 재사용하지 않는다. 통합 기본 화면은 reconciliation이 준비된 뒤 external 수입·지출을 우선 보여주고 gross는 보조 정보로 둔다. 이전 단계에서는 gross의 의미만 명확히 표기한다.

이체 pair는 계좌 잔액에 이미 반영된 입출금이다. **외부 흐름 집계에서만 제외**하고 잔액에서 금액을 빼거나 더하지 않는다. 이중 조정을 방지한다.

### 기간 필터와 경계 이체

전체 선택 데이터셋에서 중복 및 pair를 먼저 확정한 뒤, 달력 날짜의 양 끝을 포함해 사용자 지정 기간을 필터한다. 그 기간의 external 뷰에서는 pair에 속한 **범위 안의 각 거래만** 외부 합계에서 제외한다. 예를 들어 9월 30일 출금과 10월 1일 입금이 확인된 pair이고 9월만 선택하면, 9월 출금은 9월 gross에는 남고 9월 external에서는 빠진다. 10월 입금은 9월 어느 합계에도 들어가지 않는다. 범위마다 pair를 새로 만들면 한쪽만 남아 결과가 달라지는 오류가 생긴다. 기간 경계에서 gross와 external 차이는 “기간 경계의 내부이체”로 설명한다. 파일이 빠져 상대편을 확인할 수 없으면 확정하지 않는다.

`historicalPeriodAggregator`는 가능한 한 계좌나 이체를 모르도록 유지한다. 상위에서 중복 정리된 gross 거래와 외부 거래를 각각 만들어 기존 순수 집계기에 전달한다. 단, 그 집계기의 `closingBalance` 필드는 다중 계좌 합계로 표시하지 않는다. 파일 A가 2025~2026, B가 2026만 포함하고 기간이 2025라면 B의 거래 0건은 정상적인 범위 밖 상태다. 다만 B의 거래 날짜 범위를 export의 보장된 완전한 커버리지로 오해하지 않는다.

## 6. 잔액과 Forecast

### 계좌 잔액

같은 계좌의 여러 파일 잔액을 합치지 않는다. 중복/겹침을 정리한 뒤 계좌별로 가장 최신의 **유효한 관측 잔액 한 개**를 고르고 날짜·있으면 시각·출처를 같이 보존한다. 동일 시점에 상충하는 잔액이 있거나 시간 순서가 확정되지 않아 최신값을 고를 수 없으면 `conflicting`으로 둔다. 잔액 `0`은 유효한 관측값이며 `null`과 다르다. 2026-09-10에 관측된 B 잔액을 2026-09-20의 잔액으로 이름만 바꾸지 않는다.

| 통합 잔액 후보 | 판단 |
| --- | --- |
| 각 계좌 최신 유효 잔액 단순 합 | 값은 만들기 쉽지만 기준일이 달라 “현재 잔액”이 아니다. 모든 계좌의 관측값이 있을 때만 **서로 다른 기준일의 관측 잔액 합**으로 참고 표기 가능. |
| 공통 기준일의 잔액만 합 | 더 엄격하지만 거래가 없는 날의 잔액 증거가 없을 수 있다. 증거 없는 carry-forward를 금지한다. |
| 사용자 통합 현재 잔액 직접 입력 | 누락·시차를 해소할 수 있다. 포함 계좌 범위와 기준일을 명시적으로 확인해야 한다. |
| 계좌별 직접 잔액 보정 | 가장 유연하지만 입력 부담과 실수 가능성이 크다. 후속 단계. |

권장 MVP: 계좌 하나라도 잔액이 없거나 충돌하면 **완전한 통합 잔액 숫자를 숨긴다**. 확인된 계좌 잔액은 계좌별로 보여주되 부분합을 통합 잔액 카드에 놓지 않는다. 모든 계좌 잔액이 있더라도 기준일이 다르면 기준일 목록과 “서로 다른 날짜의 관측값 합”이라는 이름으로만 참고 값을 표시한다. 날짜가 같아도 오늘의 잔액이라는 증거는 아니다. `dateCoverage`는 해당 파일에서 본 거래 최소/최대 날짜이지 추출 완료일이나 무거래 보증일이 아니다.

Forecast 시작 잔액은 더 엄격하다. 다중 계좌에서 (1) 포함 계좌가 모두 확인되고, (2) 중복·출처 범위가 해결되고, (3) **같은 as-of 기준의 완전한 잔액이 명시적으로 확인**되었거나 사용자가 포함 계좌 전체의 통합 현재 잔액·기준일을 직접 입력하고 확인했을 때만 후보가 된다. 단순히 최신 거래일이 같다는 사실은 충분하지 않다. 잔액 한 개가 빠지면 0으로 대체하지 않고 Forecast를 비활성화한다. 단일 파일의 기존 `file balance → manual fallback` 우선순위는 그대로 둔다. 다중 파일 수동 통합 잔액은 새로운 명시적 동작이며 48B에서 구현하지 않는다. 특정 계좌만 보정하는 수동 잔액은 이후 단계에서 계좌·기준일·입력 출처를 가진다.

### Forecast 거래 입력

Confirmed duplicate는 한 번만 넣고, confirmed internal transfer pair 양쪽은 **통합 외부 Forecast의 반복 거래 및 확정 파일 미래 거래 입력에서** 제외한다. 계좌별 Forecast에서는 실제 출금/입금을 유지한다. `financialNature`만 보고 단독 거래를 제외하지 않는다. 같은 적금 이체가 매월 일어나면 계좌 A의 반복 출금과 B의 반복 입금을 둘 다 외부 Forecast에 넣지 않는다. Pair가 일부 월에만 관측되었다고 향후의 모든 유사 거래를 자동 내부이체로 간주하지 않는다. 반복 패턴 식별의 계좌 범위와 해당 패턴의 이체 확정 근거를 별도로 설계·검증해야 한다.

현재 반복 키(`description | category | direction`)는 서로 다른 계좌의 같은 설명을 합칠 수 있다. 통합 Forecast에서는 계좌별로 중복·이체 처리를 마친 후 반복 거래를 만들고 계좌 ID를 키 또는 상위 그룹 경계에 포함한다. 현재 detector를 모든 범위에 대해 바로 바꾸지 않는다. 파일 미래 거래 ID는 배열 인덱스만 사용하므로 새 전역 거래 ID를 바탕으로 만들고 출처를 유지한다. 미래 양방향 pair의 자동 연결은 historical pair와 분리된 검증 과제다. 48B에서는 다중 Forecast를 제공하지 않는다.

직접 입력 예정 거래는 현재 파일명 기반 저장값이다. 향후 모델은 `scope: consolidated | account`, 선택적 `accountSourceId`, 사용자 입력임을 구분한다. 통합 외부 일정은 한 번만, 계좌 일정은 해당 계좌에만 적용한다. 기존 파일명 키에 저장된 일정은 다중 세션으로 자동 합치거나 중복 적용하지 않는다. 48B 다중 화면에서는 직접 예정 거래/통합 Forecast를 제한하고 단일 파일 저장 동작만 유지한다. 이후 명시적 마이그레이션·충돌 처리와 저장 범위 검토 후 지원한다.

### 과거 잔액 그래프

현재 월별 그래프는 그 월 거래에서 마지막으로 관측된 **한 파일/한 계좌** 잔액이다. 다중 거래를 넣으면 가장 늦은 한 계좌 잔액만 나올 수 있어 사용 금지다. 선택지는 (A) 다중 계좌의 통합 과거 잔액 그래프 제한, (B) 같은 월 각 계좌의 유효한 월말 관측이 모두 있을 때만 점 생성, (C) 이전 잔액 carry-forward이다. 권장 MVP는 **A**: 단일 파일 그래프 유지, 다중 계좌에서는 통합 과거 잔액 선을 숨기고 이유를 표시한다. B는 “그 달 마지막 관측값”을 실제 월말 잔액으로 오인할 수 있고, C는 파일 범위 사이 누락 거래를 무거래로 추정한다. 이후 공통 as-of 및 완전한 커버리지 증거가 있으면 B/C를 재검토한다. 통합 Forecast가 준비된 후에도 과거 점과 예상 점의 기준일·포함 계좌가 달라지면 선을 이어 그리지 않는다.

## 7. 상태 수명, 품질, 오류

각 `SheetSelection`에 업로드/파싱/매핑 필요/준비/오류 상태, 시트·헤더·매핑, 거래, 품질, 관측 거래 날짜 범위를 관리한다. 파일 목록의 상태는 그 파일의 선택 상태에서 파생한다. 자동 인식 실패한 B만 직접 설정하고 A의 성공 결과는 보존한다. 선택별 `dataQualityAnalyzer` 결과를 유지하고, 통합에서는 합산 가능한 품질 건수와 `partial/unresolved` 출처 상태를 별도로 보여준다. 3개 중 2개만 ready면 그 2개의 파일별 결과는 볼 수 있지만 **전체 통합 external 수입·지출/잔액/Forecast를 확정값으로 표시하지 않는다**. 선택한 파일만의 gross가 필요하면 “준비된 2/3개 파일의 계좌 입출금 총액”이라고 한정한다. 사용자가 실패 파일을 제외하려면 명시적으로 제거해야 한다.

| 동작 | 세션 처리 |
| --- | --- |
| 첫 파일 | 기존 단일 파일 경로를 유지. 다중 컨테이너의 첫 소스로도 표현 가능. |
| 파일 추가 | 새 파일 ID 부여. 기존 파일 상태 유지. 해당 파일 검증/매핑 후 전체 중복·이체·합계 파생값 무효화·재계산. |
| 동일 파일 재선택 | 바이트 중복이면 기존 파일 지목/경고. 입력 컨트롤은 같은 파일도 다시 선택 가능해야 한다. |
| 파일 제거 | 해당 거래·잔액·품질·매핑·미래 거래 선택 제거. 연결된 duplicate/transfer 관계 무효화. 나머지로 통합 결과·Forecast·그래프 재계산. 다른 파일의 사용자가 정한 계좌 묶음은 남긴다. |
| 파일 교체 | MVP에서는 “기존 파일 제거 → 새 파일 추가”를 명시적으로 수행한다. 같은 계좌 그룹 재선택은 사용자 확인 후 적용. 조용한 최신 export 덮어쓰기는 금지. |
| 전체 초기화 | 업로드 파일·계좌 묶음·파생 관계·수동 통합 잔액/선택을 세션에서 비운다. 기존 영구 설정을 임의로 삭제하지 않는다. |
| 시트/헤더/매핑 변경 | 해당 파일의 파싱 결과, 거래 ID, 품질, 연결된 중복/이체 관계를 무효화하고 재분석한다. 다른 파일 원본은 보존. |

비동기 파일 처리 완료 순서가 사용자 선택 순서를 바꾸지 않도록 파일별 요청 ID/세대 번호를 사용한다. 제거되거나 교체된 파일의 늦게 완료된 파싱 결과는 버린다. 모든 통합 결과는 활성 ready 소스의 버전에서 파생하며 오래된 캐시를 표시하지 않는다. 원본 파일/거래는 새로고침 후 복원하지 않는 현재 원칙을 유지한다.

## 8. 개인정보, 성능, 화면·PDF

업로드 원본, 거래, 잔액, 계좌번호, 원본 분류, 파일 content hash, 계좌 매핑과 이체 pair는 런타임 메모리에만 둔다. 계좌번호의 전체 값은 로컬 저장소·문서·테스트·analytics에 넣지 않는다. 사용자 label도 계좌를 암시할 수 있으므로 48B에서는 저장하지 않는다. 기존 `localStorage`에는 **파일명 키의 시나리오와 사용자가 입력한 예정 거래의 날짜·설명·금액**이 이미 들어갈 수 있다. 이를 업로드 원본 거래 저장 금지와 혼동하지 않는다. 다중 계좌용 영구 저장 범위는 별도 개인정보 검토 전 확장하지 않는다. 브라우저 인쇄/PDF에는 현재 단일 파일 리포트만 유지한다. 다중 분석 리포트는 범위, 선택 파일, 제외·미확정 상태, 잔액 기준일을 명시할 수 있을 때 후속 구현한다.

파일당 10 MiB는 그대로 두고, 48B 초기 권장 상한은 **파일 5개, 합계 25 MiB**다. 이는 현재 다중 파일 성능 측정 전의 보수적 제품 가설이며, 5×1만 행과 10×1만 행의 합성 벤치마크(파싱, 중복, 이체, 집계, 렌더링, 피크 메모리)로 조정한다. 파일 추가 시 개별·총량을 둘 다 검사한다. 대량 거래는 한 파일씩 읽고 불필요한 ArrayBuffer/워크북 참조를 해제하며, 파생 목록을 memoize하고 긴 거래 목록은 렌더링 범위를 제한하는 방안을 검토한다. 48B에서는 이체 matching이 없지만 이후 인덱스 기반으로 구현해 전수 O(n²)을 피한다.

텍스트 화면 초안(구현 아님):

```text
[거래내역 파일 추가]  파일 2/5 · 합계 크기 표시
✓ 생활비.xlsx   계좌: 생활비 · 준비됨 · 2026-01-01~09-20 · 설정/제거
! 저축.xls     계좌 확인/직접 설정 필요 · 설정/제거
[계좌별 입출금]  각 계좌의 실제 입금·출금·최근 관측 잔액/기준일
[통합 분석]      준비된 출처 범위와 gross/external 가능 여부 명시
[확인 필요]      중복 후보·이체 후보·누락 잔액·파일 오류
```

375px에서는 표 대신 각 파일 카드를 세로 목록으로 쌓는다. 파일명·상태·날짜 범위·매핑 필요 여부를 텍스트로 제공하고, 제거/설정 버튼의 접근 가능한 이름에 파일명을 넣는다. 상태 변경은 `role=status` 또는 적절한 live region으로 읽히게 하되 모든 파싱 진행 갱신을 과도하게 알리지 않는다. 색상이나 아이콘만으로 성공·경고를 구분하지 않는다. Day 48B 구현 시 `FileUploadSection`, 온보딩, 개인정보 안내, 사용법, PDF/인쇄 가능 범위의 문구를 함께 점검한다.

## 9. 불변식과 합성 검증

1. **I1** 원본 `Transaction`과 출처 파일 행은 수정·삭제하지 않는다. 제외 상태는 파생 관계다.
2. **I2** `N=1`이면 Day 47까지의 숫자, UI 동작, 저장·Forecast·그래프·PDF 의미가 동일하다.
3. **I3** 자동 내부이체 제외는 유일한 높은 확신 pair에 한정한다.
4. **I4** 모호한 pair는 외부 거래에서 제외하지 않는다.
5. **I5** 중복 거래와 내부이체는 별도 모델·단계다.
6. **I6** 계좌 잔액은 관측 stock, 거래 입출금은 기간 flow다. 서로 대신하지 않는다.
7. **I7** 잔액 없음은 `null`이다. 관측된 실제 `0`과 구분한다.
8. **I8** 업로드 원본 거래·잔액·계좌번호 등은 영구 저장하지 않는다.
9. **I9** 파일명·label만으로 계좌를 식별하지 않는다.
10. **I10** 다중 Forecast는 완전한 시작 잔액과 분석 범위 확인 후에만 켠다.
11. **I11** 잔액은 계좌당 한 관측값만 통합 후보에 쓰고, 서로 다른 기준일을 현재값으로 포장하지 않는다.
12. **I12** 확정 내부이체는 external flow에서 양쪽을 제외하지만 계좌별 flow와 잔액에는 남는다.
13. **I13** 준비되지 않은 파일이나 미확인 계좌가 있으면 전체 통합 숫자의 범위를 명시하거나 확정값을 숨긴다.
14. **I14** 미래 날짜 거래는 현재처럼 과거 실적과 분리하고, 출처 및 선택 상태를 보존한다.
15. **I15** 하나의 거래는 한 중복 관계의 대표 선택 및 최대 한 확정 transfer pair에만 참여한다.

단일 파일 회귀 기준(기존 샘플 Excel/CSV 테스트): 입금 2,850,000원, 출금 4,347,000원, 순현금흐름 -1,497,000원, 최근 잔액 -497,000원, 보수/기준/낙관 Forecast 마지막 월말 277,491 / 456,000 / 634,509원. 단일 파일에 `financialNature=internal_transfer`가 있어도 현행처럼 입출금에 포함된다.

합성 두 계좌 예시: A에 급여 +3,000,000원, 생활비 -600,000원, B로 이체 -500,000원, 관측 잔액 1,900,000원. B에 A에서 +500,000원, 투자 -200,000원, 관측 잔액 800,000원. B의 합성 시작 잔액은 500,000원으로 **예시가 명시적으로 가정**한다(실제 데이터에서 역산해 채우지 않음). 두 관측 잔액의 기준일과 포함 범위가 같고 pair가 확인되었다고 가정하면 gross 입금 3,500,000원 / 출금 1,300,000원, external 입금 3,000,000원 / 출금 800,000원 / 순 +2,200,000원, 통합 관측 잔액 2,700,000원이다. A의 `savings` 출금과 B의 입금이 확인된 pair이면 저축 목적 표시는 유지해도 외부 수입·지출에는 두 행 모두 들어가지 않는다.

## 10. 구현 단계, 테스트 계획, 남은 질문

| 단계 | 한 기능 단위의 범위 | 표시/기능 gate |
| --- | --- | --- |
| **48B** | 다중 파일 추가·제거, 파일별 파싱/수동 매핑·상태·출처 ID, 기존 단일 파일 경로 보호. 파일당 한 시트. | 다중 상태에서는 파일별 결과와 선택 파일의 gross만 정확한 명칭으로 표시. 통합 external/잔액/Forecast/과거 잔액 그래프/PDF는 비활성. |
| **48C** | 사용자 계좌 묶음, 세션 전용 label, 동일 바이트 파일 경고, 겹치는 export의 보수적 거래 중복 처리, 계좌별 잔액·관측일. | 중복 해결 전 gross도 확정하지 않음. 모두 확인되면 계좌별·gross 분석 제공. 기준일 다른 잔액은 참고값으로 한정. |
| **48D** | 내부이체 후보·일대일 확정·모호함 표시, 경제적 성격과 관계 분리의 파생 모델, external 과거 분석. | 확인된 pair만 external 제외. 48D 첫 유용한 통합 외부 현금흐름 MVP. 사용자 확인/거절은 자동 기준의 실제 오탐 검증 후 추가하되, 오탐이 발견되면 자동 제외 gate를 더 좁힌다. |
| **48E** | 다중 Forecast 시작 잔액 확인/수동 통합 입력, 계좌별 반복 키, 미래 파일 거래, 직접 예정 거래의 범위·저장 검토. | 시작 잔액·계좌·중복·이체 상태가 불완전하면 Forecast 없음. |
| 이후 | 공통 기준일의 과거 통합 잔액 그래프, 계좌별 수동 보정, multi-sheet, 다중 PDF, 사용자 이체 수정, 계좌별 분류. | 신뢰할 수 있는 데이터 커버리지와 근거가 생길 때만 제공. |

첫 usable 다중 파일 릴리스를 늦추지 않기 위해 48B의 파일별 분석부터 제공한다. 48C에서는 “통합 수입·지출” 대신 **계좌 입출금 총액(gross)**을 표시한다. 내부이체가 제거되지 않았으므로 이를 외부 수입·소비로 부르거나 기존 단일 파일 Forecast에 넣지 않는다. 사용자가 요구한 진정한 통합 외부 흐름은 48D에서 제공한다.

필수 자동 테스트 매트릭스:

| 그룹 | 사례와 기대 결과 |
| --- | --- |
| 회귀 | 파일 1개 Excel/CSV, Day 47 분류, 기준 숫자 7개, 파일명 설정·수동 잔액·그래프·PDF 동작 동일. |
| 출처 | 파일 2개 같은 이름/행 번호의 ID 충돌 없음, 같은 계좌의 1·2·3월 파일, 다른 계좌, 한 workbook 복수 계좌 시트의 제한 안내. |
| 중복 | 동일 바이트 재선택, 겹치는 export, 정확히 같은 날짜·금액·설명인 실제 두 거래, 잔액/시각 없음, 대표 출처 추적. |
| 이체 | 유일한 높은 확신 pair, 한쪽 파일 없음, 2개 동등 후보, 수수료 별도 거래, ±5분·±10분 경계, 9/30→10/1 자정 경계, 적금 성격과 내부이체 중첩. |
| 잔액 | 같은 계좌 여러 파일에서 최신 하나만, 다른 기준일, 실제 0, 하나 누락, 충돌, 부분합 숨김, 수동 통합 잔액의 범위·기준일. |
| 기간/전망 | 사용자 지정 기간 경계 pair, 2025/2026 파일 커버리지 차이, 계좌별 반복 키, 매월 적금 이체, 미래 파일 거래의 출처/선택, 예정 거래 한 번만 반영, Forecast gate, 그래프 공백. |
| 상태/품질 | 파일 추가·제거·교체·전체 초기화·늦게 끝난 파싱, 파일별 직접 매핑, 3개 중 1개 오류의 부분 범위 경고, 품질 합계. |
| 비기능 | 파일 5×1만/10×1만 행, 파일당·총량 제한, 375px 카드, 키보드·스크린리더 상태/제거, 저장소에 업로드 원본·계좌번호/label·잔액 미기록, PDF 범위. |

48B 전에 미리 정해야 하는 안전 규칙은 위 표와 본문에서 확정했다. 남은 운영 가설은 파일 상한 5개/25 MiB와 시간 후보 ±5/10분의 실제 데이터 적합성이다. 이 값들은 벤치마크/합성 오탐 사례로 조정할 수 있으며, 48B에는 이체 자동 제거가 없으므로 시작을 막지 않는다. 원본 파일의 완전한 export 기간, 타임존, 은행별 고유 거래 ID, 개인정보에 안전한 계좌 fingerprint는 현재 확인되지 않았으므로 추정하지 않는다. 따라서 해당 증거를 요구하는 기능은 gate 뒤에 둔다.

**Day 48A 판정: MULTI-FILE ARCHITECTURE READY.** 파일·계좌 신원, 출처, 중복, 이체, 잔액, Forecast, 기간·그래프, 수명·개인정보, 성능, 단계별 테스트 정책이 정의되었다. 이 판정은 다중 파일 제품 구현 완료나 데이터 정확도 실측을 뜻하지 않는다.
