import { coreHello } from '@specpilot/core';

export function cliHello(): string {
  return `SpecPilot cli: ready (step1) | ${coreHello()}`;
}
