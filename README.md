# Finance Assistant

통장 거래내역 Excel 또는 CSV를 현재 브라우저에서 분석해 최근 현금흐름과 향후 3개월 예상 잔액을 보여주는 개인사업자용 도구입니다. 결과는 과거 거래 패턴에 근거한 추정치이며 회계·세무 보고서나 미래 잔액의 보장이 아닙니다.

## 대상 사용자

- 통장 거래내역은 Excel로 받을 수 있지만 1~3개월 뒤 자금 부족을 따로 계산하기 어려운 개인사업자
- 반복 매출·고정비와 확정 예정 거래를 함께 보며 단기 자금계획을 세우려는 소규모 사업자
- 복잡한 ERP보다 한 파일을 빠르게 점검하는 도구가 필요한 사용자

## 주요 기능

- `.xlsx`, `.xls`, `.csv` 파일의 거래 헤더·컬럼 자동 인식
- 날짜·금액 정규화와 입금·출금, 월별·카테고리별 집계
- 반복 거래와 최근 수입 추세를 반영한 향후 3개월 전망
- 보수·기준·낙관 예상 범위 및 확정 예정 거래 반영
- 최저 예상 잔액, 자금 부족 기간, 회복 예상월, 필요 현금 여유 분석
- 자동 인식 실패 시 시트·헤더·컬럼 직접 설정
- 데이터 품질·분석 제외 사유와 복구 방법 안내
- 브라우저 인쇄 기능을 이용한 PDF 저장용 리포트

## 사용 흐름

1. 첫 화면의 안내를 읽고 샘플 Excel·CSV를 내려받거나 내 거래내역 파일을 선택합니다.
2. 자동 인식 결과와 데이터 품질 안내를 확인합니다. 결과가 다르면 `자동 인식 수정`에서 직접 설정합니다.
3. 최근 현금흐름과 보수·기준·낙관 3개월 전망을 비교합니다.
4. 앞으로 확정된 입출금이 있으면 `확정 예정 거래`에 추가합니다.
5. 현금 위험과 추천 행동을 확인하고 필요한 경우 리포트를 인쇄하거나 PDF로 저장합니다.

## 로컬 실행

Node.js와 npm이 준비된 환경에서 다음 명령을 실행합니다.

```bash
npm install
npm run dev
```

개발 서버가 안내하는 로컬 주소를 브라우저에서 엽니다. 이 저장소의 의존성이 이미 설치된 환경에서는 `npm install`을 다시 실행할 필요가 없습니다.

## 검증 명령어

```bash
npm test
npm run lint
npm run build
npm run preview
git diff --check
```

- `npm test`: 자동 테스트 실행
- `npm run lint`: 코드 규칙 검사
- `npm run build`: TypeScript 검사와 production 번들 생성
- `npm run preview`: 생성된 production 번들을 로컬에서 확인

## 개인정보와 저장 방식

- 업로드한 Excel·CSV는 외부 분석 서버로 보내지 않고 현재 브라우저 메모리에서 읽고 분석합니다.
- 원본 거래내역과 계산된 분석 결과는 브라우저 저장소에 저장하지 않습니다.
- 선택한 예상 범위와 확정 예정 거래는 파일명을 기준으로 브라우저 `localStorage`에 저장될 수 있습니다.
- 같은 파일명의 다른 파일은 저장된 설정을 공유할 수 있습니다.
- 현재 코드에는 거래 데이터를 전송하는 API나 분석·광고 SDK가 없습니다.

민감한 금융 파일은 신뢰할 수 있는 기기에서 사용하고, 공용 기기에서는 사용 후 브라우저 사이트 데이터를 지우는 것을 권장합니다.

## 지원 파일 범위

- 파일 형식: `.xlsx`, `.xls`, 쉼표(`,`) 구분 `.csv`
- 최대 파일 크기: 10MB
- 자동 헤더 탐색: 1~30행
- 직접 설정 헤더 선택: 실제 데이터에 존재하는 행 중 1~100행
- 101행 이후의 헤더는 현재 지원하지 않습니다.
- 수식 셀은 Excel 파일에 저장된 계산 결과(cached result)를 사용하며 수식을 직접 실행하지 않습니다.
- CSV는 UTF-8·UTF-8 BOM을 우선 지원합니다. UTF-8 strict decoding 실패 시 브라우저의 WHATWG `euc-kr` 디코더로 CP949/EUC-KR을 시도하며, 둘 다 실패하거나 깨진 문자 `�`가 반복되면 분석을 중단합니다.
- CSV는 CRLF·LF, 빈 셀·행, 쉼표가 포함된 큰따옴표 필드와 `""` 이스케이프를 지원합니다. 세미콜론·탭 구분은 지원하지 않습니다.
- CSV의 날짜는 문자열로 처리하므로 `46000` 같은 값을 Excel 날짜 일련번호로 해석하지 않습니다. `=`, `+`, `@`로 시작하는 값도 수식으로 실행하지 않습니다.
- 거래일과 입금·출금 또는 금액·거래구분 컬럼이 필요합니다. 잔액과 거래내용 컬럼이 있으면 더 많은 분석을 제공합니다.
- 가계부 CSV의 `수입/지출`은 거래 방향으로, `내역`은 거래 설명으로 인식합니다. `분류`와 `하위 분류`는 금액이나 거래 방향으로 해석하지 않습니다.
- 브라우저의 오늘보다 미래인 원본 거래는 전체 업로드 건수에는 남기되 과거 실적·월별 집계·반복 거래·수입 추세·최근 잔액·전망 기준월에서는 제외합니다. 예정 거래라면 `확정 예정 거래`에 별도로 추가해야 합니다.

샘플 파일: [`finance-assistant-sample.xlsx`](public/samples/finance-assistant-sample.xlsx), [`finance-assistant-sample.csv`](public/samples/finance-assistant-sample.csv)

사용 중인 오픈소스 소프트웨어의 저작권과 라이선스 고지는 [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md)에서 확인할 수 있습니다.

## 알려진 한계

- 향후 전망은 3개월이며 과거 반복 거래와 최근 수입 추세에 기반한 추정치입니다.
- 여러 계좌·파일 통합, 로그인, 서버 저장, 기기 간 동기화는 지원하지 않습니다.
- 유효한 최근 잔액 또는 반복 거래가 부족하면 전망과 위험 분석 일부를 제공하지 못할 수 있습니다.
- 큰 파일은 브라우저 메모리와 상세 거래 렌더링 성능의 영향을 받을 수 있습니다.
- 거래 자동 분류 표는 기본 50건을 표시하며, 확인이 필요한 거래는 50건 밖에 있어도 함께 표시합니다.
- 반복 거래 분석은 기존 탐지 순서를 유지한 채 기본 10개를 표시하며, 전체 보기와 접기를 지원합니다. Forecast 계산에는 탐지된 전체 반복 거래를 사용합니다.
- 실제 은행·회계 프로그램 파일의 모든 변형을 보장하지 않으며 자동 인식 실패 시 직접 설정이 필요합니다.

## 배포

production build 결과물은 `dist/`에 생성됩니다. 저장소의 `vercel.json`에는 다음 응답 헤더가 선언되어 있습니다.

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

실제 배포 주소와 런타임 헤더는 배포 환경에서 별도로 확인해야 합니다. 현재 저장소에는 특정 production URL이나 Vercel 프로젝트 연결 정보가 포함되어 있지 않습니다.

## 릴리스 상태

현재 권장 상태는 **Public Beta 테스트 시작 단계**입니다. Vercel production 배포와 정상 샘플 분석을 확인했고, `xlsx`·`nanoid` 보안 수정 및 npm 보안 감사 0건을 확인했습니다. 다만 아직 실제 사용자와 실제 은행 Excel의 호환성을 검증하는 단계이므로 Stable, Production Ready 또는 회계 정확성 보장을 의미하지 않습니다.

Beta 진행 방법은 [`docs/BETA_TEST_GUIDE.md`](docs/BETA_TEST_GUIDE.md), 익명 결과 기록은 [`docs/BETA_TEST_RESULTS.md`](docs/BETA_TEST_RESULTS.md), Excel 호환성 추적은 [`docs/EXCEL_COMPATIBILITY.md`](docs/EXCEL_COMPATIBILITY.md), 개인정보를 제외한 이슈 기록은 [`docs/BETA_ISSUE_TEMPLATE.md`](docs/BETA_ISSUE_TEMPLATE.md)를 참고하세요. 세부 점검 절차는 [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md), 제품 범위는 [`docs/PRODUCT.md`](docs/PRODUCT.md), 변경 기록은 [`CHANGELOG.md`](CHANGELOG.md)를 참고하세요.

### `xlsx` 의존성 보안 상태

Excel 파서는 SheetJS 공식 CDN 배포판 `xlsx@0.20.3`을 사용합니다. 기존 `xlsx@0.18.5`에 해당하던 Prototype Pollution(`<0.19.3`)과 정규식 서비스 거부(`<0.20.2`) 영향 범위를 벗어나며, npm 보안 감사에서도 두 `xlsx` 경고가 제거된 것을 확인했습니다.

npm registry의 `xlsx` 최신 버전은 여전히 0.18.5이므로 `package.json`과 lockfile은 공식 0.20.3 tarball URL과 무결성 해시를 고정합니다. 브라우저 전용 처리, 지원 확장자 제한, 파싱 전 10MB 제한, 지연 로딩도 그대로 유지합니다. Vite 빌드 체인의 `nanoid`는 안전한 patch 버전 3.3.18로 갱신했으며, 전체·production 의존성 보안 감사에서 취약점 0건을 확인했습니다.
