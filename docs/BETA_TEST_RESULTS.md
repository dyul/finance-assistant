# Finance Assistant Beta Test Results

> 상태: 첫 실제 사용자 테스트 시작 전 내부 기록 양식
> Beta-01: **Not yet conducted**
> 대상 규모: 초기 3~5명
> 주의: 작은 표본의 결과를 시장 전체 성과나 통계적으로 검증된 결론으로 해석하지 않습니다.

## 기록 원칙

- 참가자는 `Participant 01`처럼 익명 번호로만 구분합니다.
- 실명, 회사명, 사업자등록번호, 계좌번호, 실제 거래처·적요·금액·잔액을 기록하지 않습니다.
- 원본 Excel이나 전체 거래내역을 repository에 저장하지 않습니다.
- 파일 형식, 대략적인 크기·행 수, 헤더 위치와 입출금 구조 같은 비식별 구조 정보만 기록합니다.
- 사용자가 말한 의견(`Opinion`)과 실제로 관찰한 행동(`Observation`)을 구분합니다.
- 비율을 적을 때는 반드시 `3명 중 2명`처럼 분자와 분모를 함께 기록하고, 제품 검증 완료로 확대 해석하지 않습니다.

## 첫 Beta 사용자 정의

### Primary

- 개인사업자 또는 소규모 사업 운영자
- 사업 통장 거래내역을 Excel 또는 CSV로 받을 수 있는 사람
- 별도 ERP·자금관리 시스템이 없거나 사용 빈도가 낮은 사람

### Secondary

- 사업의 현금 입출금을 직접 관리하는 사람
- 회계 전문가는 아니지만 업무에서 Excel을 사용하는 사람

### 초기 테스트 제외 권장

- 복잡한 연결·법인 회계가 필요한 대기업 사용자
- 다계좌 통합 분석이 필수인 사용자
- 회계·세무 신고 기능을 기대하는 사용자
- 10MB 초과 Excel만 사용하는 사용자

이 기준은 초기 테스트 모집 기준이며 앱 기능으로 구현하지 않습니다.

## Test Summary

- 테스트 시작일:
- 누적 사용자 수:
- Sample 시도:
- Own-file 시도:
- 성공 분석:
- 부분 분석:
- 분석 실패:
- 직접 설정 사용:
- PDF 사용:
- 추가 설명 없이 완료:
- Forecast 의미 설명 가능:
- 행동 가능성 응답:
- 재사용 의향:
- 지불 의향 신호:

## 익명 Beta Feedback Log

- 분류: `FEATURE REQUEST / VALUE`
- 내용: 파일에 이미 포함된 카드 할부 등 미래 날짜 거래가 향후 Forecast에 자동 반영되기를 원함
- 개인정보·실제 금액·파일명: 기록하지 않음
- 반영 상태: Day 40 구현 및 합성 회귀 검증

- 분류: `UX / VALUE`
- 내용: 장기간 누적 데이터가 월별 목록으로 길게 보여 과거 흐름을 월별·분기별·연도별로 요약해서 보고 싶음
- 개인정보·실제 거래 기간·파일명: 기록하지 않음
- 반영 상태: Day 41 구현 및 합성 장기 데이터 회귀 검증

## 수동 성공 지표

| 지표 | 정의 | 기록 방법 |
| --- | --- | --- |
| Upload Success | 자기 Excel 분석 성공 사용자 / 자기 Excel 시도 사용자 | 분자와 분모를 함께 기록 |
| Unassisted Completion | 추가 설명 없이 분석 결과까지 도달 | 완료 여부와 막힌 위치 기록 |
| Forecast Understanding | 향후 3개월 전망의 의미를 사용자 스스로 설명 | 설명 요지를 비식별 문장으로 기록 |
| Actionability | 결과를 보고 실제 행동을 생각할 수 있다고 응답 | 행동의 종류만 기록하고 실제 금액은 제외 |
| Return Intent | 다음 달 또는 향후 다시 사용할 의향 | 예/아니오와 이유 기록 |
| Willingness to Pay Signal | 비용을 낼 이유가 되는 기능을 구체적으로 언급 | 기능명과 이유만 기록 |

## 성공 기준

### PASS

- 사용자가 서비스 목적을 대략 이해
- Sample 업로드 성공
- 주요 결과를 최소 1개 이상 이해
- Forecast 의미를 대략 설명 가능
- Blocking 오류 없음

### STRONG PASS

PASS 조건에 더해 다음을 만족합니다.

- 자기 파일 분석 성공
- 핵심 Forecast를 스스로 찾음
- 다음 달 재사용 의향 있음

### PARTIAL

- 분석은 성공했지만 결과 이해도가 낮음
- 또는 UX 도움 없이는 진행하기 어려움

### FAIL

- Sample부터 진행 불가
- 주요 계산 오류 또는 잘못된 재무 결과
- 핵심 기능 접근 불가

## 운영 중 관찰 항목

1. 첫 화면에서 서비스 목적을 이해하는가
2. 어떤 Excel을 올려야 하는지 이해하는가
3. 샘플 파일을 먼저 사용하는가
4. 자기 Excel을 바로 업로드하는가
5. 업로드 과정에서 망설이는가
6. 첫 번째로 보는 숫자는 무엇인가
7. Forecast를 어떻게 이해하는가
8. 보수·기준·낙관을 직접 조작하는가
9. 자금 부족 안내를 이해하는가
10. PDF를 필요로 하는가
11. 오류가 발생하면 직접 해결 가능한가
12. 다시 사용할 이유가 있는가

사용자가 막히면 바로 설명하지 않고 막힌 위치와 행동을 먼저 기록합니다.

---

## Beta-01 Session

### 기본 정보

- Status: Not yet conducted
- Tester: Beta-01
- Date:
- Device:
- OS:
- Browser:

### Input

- Source: Sample / Own file / Both
- Format: CSV / XLSX / XLS
- Approx rows: `<100 / 100~500 / 500~1,000 / 1,000+ / unknown`
- Balance column: yes / no / unknown
- 실제 파일·금액·잔액 기록 여부: 기록하지 않음

### Timing (선택)

- Landing → first upload:
- Upload → first result:
- Total duration:

### Journey

- Understood landing: yes / partial / no / unknown
- Found upload: yes / no / unknown
- Noticed privacy guidance: yes / no / unknown
- Sample download: success / fail / not attempted
- Sample analysis: success / partial / fail / not attempted
- Own-file analysis: success / partial / fail / not attempted
- Auto sheet detection: success / fail / not applicable
- Auto mapping: success / fail / not applicable
- Manual mapping: success / fail / not attempted / not applicable
- Forecast understood: yes / partial / no / unknown
- Scenario switching: success / fail / not attempted
- Manual balance: success / fail / not attempted / not applicable
- Action Guide found: yes / no / unknown
- Scheduled transaction found: yes / no / not attempted
- PDF found: yes / no / not attempted
- Assistance required: none / minor / major

### 핵심 질문 6개

1. 처음 봤을 때 어떤 서비스라고 생각했나요?
   - 답변:
2. 어떤 Excel/CSV를 올려야 하는지 알 수 있었나요?
   - 답변:
3. 본인의 파일을 정상적으로 분석할 수 있었나요?
   - 답변:
4. 결과 화면에서 가장 먼저 눈에 들어온 정보는 무엇이었나요?
   - 답변:
5. 이해하기 어렵거나 불편했던 부분은 무엇이었나요?
   - 답변:
6. 다음 달에도 사용할 것 같나요? 그 이유는 무엇인가요?
   - 답변:

### 이해도 확인

- Forecast 의미에 대한 사용자 표현:
- 확정 숫자로 오해했는가: yes / no / unknown
- 과거 실적과 Forecast를 구분했는가: yes / partial / no / unknown
- 보수·기준·낙관 차이를 이해했는가: yes / partial / no / unknown
- 첫 번째로 본 숫자·내용:
- Action Guide를 보고 느낀 행동:

### 잔액 없는 파일(해당할 때만)

- Forecast 제한 이유 이해:
- 현재 잔액 입력 발견:
- 현재 잔액 시점에 대한 사용자 표현:
- 과거 실적에 추가되는 금액으로 오해했는가: yes / no / unknown
- 실제 잔액 기록 여부: 기록하지 않음

### Observations

사용자가 실제로 한 행동만 기록합니다.

- (테스트 전)

### Quotes / paraphrases

개인정보와 실제 재무정보를 제외하고 기록합니다.

- (테스트 전)

### Issues

각 항목은 `BUG / UX / COPY / COMPATIBILITY / FEATURE REQUEST / TRUST / VALUE` 중 하나로 분류하고, 필요하면 [`BETA_ISSUE_TEMPLATE.md`](./BETA_ISSUE_TEMPLATE.md) 링크를 추가합니다.

- (테스트 전)

### Re-use intent

- Intent: yes / maybe / no / unknown
- Reason:

### Session outcome

- Outcome: PASS / STRONG PASS / PARTIAL / FAIL / Not yet assessed
- Reason:

---

새 참가자는 위 `Beta-01 Session` 구역을 복사해 번호만 증가시킵니다.

## Issue Severity

| 심각도 | 판단 기준 | 기본 대응 |
| --- | --- | --- |
| P0 | 개인정보 노출, 데이터 외부 전송, 심각한 보안 문제 | Beta를 즉시 중단하고 blocker 보고 |
| P1 | 잘못된 금액 계산, 수입·지출 방향 반전, Forecast 계산 오류, 정상 파일 분석 불가, 잘못된 재무 의사결정을 유발할 표시 오류 | 다음 외부 테스트 전 blocker 보고·해결 판단 |
| P2 | 기능은 가능하지만 사용성이 크게 나쁨, 설명 부족, CTA 발견 어려움, 모바일 UI 문제, 지나치게 긴 화면 | 빈도와 사용자 가치 확인 후 개선 검토 |
| P3 | 문구, 간격과 사소한 시각적 개선 | 기록 후 우선순위 검토 |

## Feedback 분류

각 피드백은 다음 중 하나로 분류합니다.

- `BUG`: 구현 또는 계산이 의도대로 동작하지 않음
- `UX`: 흐름, 발견성 또는 사용성이 어려움
- `COPY`: 문구와 설명이 어렵거나 오해를 만듦
- `COMPATIBILITY`: 특정 파일·브라우저·기기 구조에서 동작하지 않음
- `FEATURE REQUEST`: 현재 범위에 없는 기능 요청
- `TRUST`: 개인정보, 정확성 또는 Forecast 신뢰 문제
- `VALUE`: 유용성, 재사용 의향과 비용 지불 이유

각 피드백에는 가능한 범위에서 빈도, 심각도, 재현 가능성과 사용자 가치를 함께 기록합니다.

## 기능 요청 처리 원칙

한 명의 요청만으로 기능을 바로 추가하지 않습니다. 다음 중 하나에 해당할 때 구현 후보로 검토합니다.

- 여러 사용자에게 반복 발생
- 현재 핵심 가치와 직접 연결
- P0 또는 P1 문제 해결에 필요

그 외 요청은 backlog 후보로만 기록합니다.
