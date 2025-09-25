# @specpilot/nest

**Nest 전용 어댑터**. 데코레이터와 스캐너로 Nest 컨벤션을 이해해 core가 쓰는 **리치 메타**를 만든다.

### 역할

- **데코레이터**: `@AutoSpec({ feedback, generateTest, unit, e2e })`
- **스캐너**: 컨트롤러/핸들러/가드/필터/인터셉터/DTO 제약/예외 패턴 수집
- (옵션) E2E 스모크 템플릿

### 피어 의존

- `@nestjs/common`, `@nestjs/core`를 **peerDependencies**로 선언 → 소비자 Nest와 호환

### 메타(예시)

```ts
type NestTargetMeta = {
  kind: 'controller'|'service'|'guard'|'pipe';
  file: string;
  symbol: string;
  routes?: Array<{ method: string; path: string }>;
  dto?: Record<string, unknown>;
  guards?: string[];
  filters?: string[];
  throws?: string[];
  effects?: string[]; // publish/emit/save 등
};
php-template
Copy code
```
