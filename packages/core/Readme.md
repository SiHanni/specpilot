# @specpilot/core

SpecPilot의 **엔진**. 코드만을 근거로 테스트 시나리오를 합성하고, AST로 `.spec.ts`를 **결정론적** 생성/병합.

### 역할

- **AST 스캐너**: 컨트롤러/서비스/DTO(class-validator)/가드/필터/예외/이벤트 호출 패턴 수집
- **룰 엔진**: 복잡도/안티패턴/N+1 의심/풀스캔·인덱스 미스 의심 판단
- **테스트 합성기**: happy / 400 / 401/403 / 409 / 예외 전파 / 사이드이펙트 검증
- **코드 생성기**: Jest 유닛 `.spec.ts` 생성 + **AST 병합(사람 코드 보존)**
- **연관성 분석**: 변경 파일 → 관련 스펙 선택 실행

### 공개 API(예정)

- `scanTargets(files): TargetMeta[]`
- `analyze(meta): Report`
- `generateSpecs(meta, outDir): Generated[]`
- `findRelatedTests(changed): string[]`

### AST

- AST = Abstract Syntax Tree(추상 구문 트리)
- Abstract(추상): 코드의 의미를 유지하면서도, 구체적인 문자·공백·코멘트 같은 건 생략한 형태
- Syntax(구문): 프로그래밍 언어의 문법 구조
- Tree(트리): 계층 구조로 표현한 자료구조
