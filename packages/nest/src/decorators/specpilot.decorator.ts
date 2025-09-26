import { SetMetadata } from '@nestjs/common';

export const SPEC_PILOT_META = 'specpilot:options';

export type SpecPilotOptions = {
  feedback?: boolean; // 피드백 리포트 생성 여부
  generateTest?: boolean; // 유닛 테스트(.spec) 생성 여부
};

export const SpecPilot = (opts: SpecPilotOptions = {}) =>
  SetMetadata(SPEC_PILOT_META, opts);
