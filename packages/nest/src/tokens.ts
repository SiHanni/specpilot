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
};
