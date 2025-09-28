// 목적: Nest 모듈 옵션 DI 토큰/타입
export const SPEC_PILOT_OPTIONS = 'SPEC_PILOT_OPTIONS';

/**
 * - enabled: boolean; // 개발 환경에서만 true 권장
 * - outDir: string; // 생성되는 .spec 출력 디렉토리 (예: 'test')
 * - trigger?: 'bootstrap' | 'first-hit'; // 실행 타이밍(부팅/첫 요청)
 */
export type SpecPilotModuleOptions = {
  enabled: boolean; // 개발 환경에서만 true 권장
  outDir: string; // 생성되는 .spec 출력 디렉토리 (예: 'test')
  trigger?: 'bootstrap' | 'first-hit'; // 실행 타이밍(부팅/첫 요청) — 2단계에서 구현
  /** 리포트 파일 출력 디렉토리 (프로젝트 루트 기준) */
  reportDir?: string; // 기본값: '.specpilot/reports'
  /** 정책 옵션 */
  policy?: SpecPilotPolicyOptions;
};

export type SpecPilotPolicyOptions = {
  /** GET이어도 보호가 필요할 가능성이 큰 경로 조각(소문자 비교) */
  sensitiveGetPathHints?: string[]; // 기본값 예: ['me','profile','account','settings','admin','billing','orders','payments','private']
  /** public 라우트로 취급할 메타 키 목록 */
  publicMetaKeys?: string[]; // 기본값 예: ['isPublic','public','allowAnonymous']
};
