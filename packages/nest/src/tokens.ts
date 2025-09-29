// 목적: SpecPilot 모듈 옵션/토큰 정의 (서비스/컨트롤러 테스트 생성 토글 포함)

export type TriggerMode = 'bootstrap' | 'first-hit';

export interface SpecPilotPolicy {
  /** public 라우트로 취급할 메타 키들 */
  publicMetaKeys?: string[];
  /** GET이라도 보호가 필요할 수 있는 경로 힌트 */
  sensitiveGetPathHints?: string[];
}

export interface SpecPilotModuleOptions {
  /** 기능 전체 on/off (기본 true) */
  enabled?: boolean;
  /** 실행 트리거: 부팅 시 전체 / 첫 호출 시 1회 */
  trigger?: TriggerMode;

  /** 리포트 출력 디렉터리 (기본 .specpilot/reports) */
  reportDir?: string;
  /** 테스트 파일 출력 디렉터리 (기본 test) */
  outDir?: string;

  /** 정책(메타 키/민감 GET 힌트) */
  policy?: SpecPilotPolicy;

  /** 컨트롤러 단위 스펙 생성 여부 (기본 true) */
  generateControllerTests?: boolean;
  /** ✅ 서비스(핵심) 단위 스펙 생성 여부 (기본 true) */
  generateServiceTests?: boolean;
}

/** DI 토큰 */
export const SPEC_PILOT_OPTIONS = 'SPEC_PILOT_OPTIONS';

/** 내부 기본값 헬퍼 */
export function withDefaults(
  opts?: SpecPilotModuleOptions
): Required<SpecPilotModuleOptions> {
  return {
    enabled: opts?.enabled ?? true,
    trigger: opts?.trigger ?? 'bootstrap',
    reportDir: opts?.reportDir ?? '.specpilot/reports',
    outDir: opts?.outDir ?? 'test',
    policy: {
      publicMetaKeys: opts?.policy?.publicMetaKeys ?? [
        'isPublic',
        'public',
        'allowAnonymous',
      ],
      sensitiveGetPathHints: opts?.policy?.sensitiveGetPathHints ?? [
        '/me',
        '/profile',
        '/account',
        '/admin',
      ],
    },
    generateControllerTests: opts?.generateControllerTests ?? true,
    generateServiceTests: opts?.generateServiceTests ?? true,
  };
}
