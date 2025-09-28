import { SetMetadata } from '@nestjs/common';

export const SPEC_PILOT_META = 'specpilot:options';

export type SpecPilotOptions = { feedback?: boolean; generateTest?: boolean };

export const SpecPilot = (opts: SpecPilotOptions = {}) =>
  SetMetadata(SPEC_PILOT_META, opts);
