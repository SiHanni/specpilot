import { DynamicModule, Module } from '@nestjs/common';
import { SPEC_PILOT_OPTIONS, SpecPilotModuleOptions } from './tokens.js';

@Module({})
export class SpecPilotModule {
  static forRoot(options: SpecPilotModuleOptions): DynamicModule {
    return {
      module: SpecPilotModule,
      providers: [{ provide: SPEC_PILOT_OPTIONS, useValue: options }],
      exports: [],
    };
  }
}
