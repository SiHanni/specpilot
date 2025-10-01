// 목적: 부팅 시(bootstrap 트리거일 때) 수집 → 피드백 실행(한 번만)
import {
  DynamicModule,
  Inject,
  Module,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { DiscoveryModule, Reflector } from '@nestjs/core';
import { SPEC_PILOT_OPTIONS, SpecPilotModuleOptions } from './tokens';
import { SpecPilotScanner } from './services/scanner.service';
import { runFeedbackForRoute } from './feedback/runner'; // ← 추가

@Module({
  imports: [DiscoveryModule],
  providers: [SpecPilotScanner, Reflector],
  exports: [],
})
export class SpecPilotModule implements OnModuleInit {
  private readonly logger = new Logger(SpecPilotModule.name);

  constructor(
    private readonly scanner: SpecPilotScanner,
    @Inject(SPEC_PILOT_OPTIONS) private readonly opts: SpecPilotModuleOptions
  ) {}

  static forRoot(options: SpecPilotModuleOptions): DynamicModule {
    return {
      module: SpecPilotModule,
      providers: [{ provide: SPEC_PILOT_OPTIONS, useValue: options }],
      exports: [],
    };
  }

  async onModuleInit() {
    if (!this.opts.enabled) return;
    const routes = this.scanner.scan();

    if (this.opts.trigger === 'bootstrap') {
      // 부팅 시 전체 실행 (각 라우트 1회)
      for (const r of routes) {
        const { file, report } = await runFeedbackForRoute(
          process.cwd(),
          r,
          this.opts
        );
        this.logger.log(
          `SpecPilot[${r.controllerName}.${r.methodName}] -> ${file} (warn:${report.summary.warn}, error:${report.summary.error})`
        );
      }
    }
  }
}
