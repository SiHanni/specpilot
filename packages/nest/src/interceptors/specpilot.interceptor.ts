// 목적: trigger === 'first-hit'일 때, 해당 라우트가 "처음 호출된 직후" 피드백을 1회 실행.
//       - 스캐너로 라우트 메타를 조회
//       - 이미 실행된 라우트는 Set으로 중복 방지
//       - 응답은 지연시키지 않도록 next.handle() 이후 tap에서 비동기 실행

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { SPEC_PILOT_OPTIONS, SpecPilotModuleOptions } from '../tokens.js';
import { SpecPilotScanner } from '../services/scanner.service.js';
import { runFeedbackForRoute } from '../feedback/runner.js';

@Injectable()
export class SpecPilotInterceptor implements NestInterceptor {
  private initialized = false;
  private done = new Set<string>(); // Controller.method 기준 1회만 실행

  constructor(
    private readonly scanner: SpecPilotScanner,
    @Inject(SPEC_PILOT_OPTIONS) private readonly opts: SpecPilotModuleOptions
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    // 비활성화면 패스
    if (!this.opts.enabled) return next.handle();

    // first-hit 모드가 아니면 패스 (bootstrap은 module.ts에서 이미 처리)
    if (this.opts.trigger !== 'first-hit') return next.handle();

    // 첫 호출에 앞서 스캔 1회 수행
    if (!this.initialized) {
      this.scanner.scan();
      this.initialized = true;
    }

    const cls = ctx.getClass();
    const handler = ctx.getHandler();
    const key = `${cls.name}.${handler.name}`;

    // 수집된 라우트 메타 조회: 없으면 패스
    const route = this.scanner.getByKey(key);
    if (!route) return next.handle();

    // 중복 실행 방지
    if (this.done.has(key)) return next.handle();

    // 응답 후 비동기로 실행 (요청 지연 방지)
    return next.handle().pipe(
      tap(() => {
        if (this.done.has(key)) return;
        this.done.add(key);
        void runFeedbackForRoute(process.cwd(), route, this.opts);
      })
    );
  }
}
