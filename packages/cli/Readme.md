# @specpilot/cli

pre-commit 훅에서 실행되는 **오케스트레이터**.

### 하는 일

1. **스테이지드 파일만** 수집
2. 대상 API/서비스 **스캔**
3. **정적 분석 리포트** 생성 (복잡도/안티패턴/N+1 의심/풀스캔·인덱스 미스 의심)
4. **유닛 테스트 .spec** 자동 생성/보정(AST 병합)
5. **연관 테스트만 실행**
6. 생성·수정된 스펙을 **자동 git add** (락으로 커밋 루프 방지)

### 명령(예정)

- `specpilot run --staged` : 전체 파이프라인
- `specpilot scan` / `report` / `gen` / `test-related` / `ci-check`

### 입출력

- 입력: 스테이지드 파일, `.specpilot.json|yaml`
- 출력: 콘솔 요약 + `./.specpilot/report.json` + 생성/갱신된 `*.spec.ts`

### 버전/호환

- Node: `>=18 <23` (루트/패키지에 engines 선언)
- TS: 소비자 TS 우선, 불일치 시 경고/폴백(추가 예정)
