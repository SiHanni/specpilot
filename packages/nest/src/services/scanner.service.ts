// 목적: @SpecPilot 데코레이터가 붙은 "핸들러"만 안전하게 수집하고,
//       HTTP 메서드/경로, Guard 유무, 파라미터 타입, 컨트롤러 생성자 주입 타입(서비스 타입 힌트)까지 모읍니다.
//       ※ MetadataScanner(deprecated 경고) 미사용. 프로토타입 메서드를 직접 열거하여 안전하게 동작시킵니다.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import {
  SPEC_PILOT_META,
  SpecPilotOptions,
} from '../decorators/specpilot.decorator';
import { RequestMethod } from '@nestjs/common';
import { SPEC_PILOT_OPTIONS, SpecPilotModuleOptions } from 'src/tokens';

const PATH_METADATA = 'path' as const;
const METHOD_METADATA = 'method' as const;
const GUARDS_METADATA = '__guards__' as const;
//const PUBLIC_META_KEYS = ['isPublic', 'public', 'allowAnonymous'] as const;

export type CollectedRoute = {
  // 식별
  controllerName: string;
  methodName: string;

  // HTTP 메타 (있으면 채움)
  http?: { method?: string; path?: string };

  // 데코레이터 옵션
  options: SpecPilotOptions;

  // 보안/파라미터 메타
  hasGuards: boolean;
  paramTypes?: any[]; // handler param types (reflect-metadata 필요)

  // 컨트롤러 생성자 주입 타입(서비스 추적 힌트)
  injectedTypes?: string[]; // 예: ['UserService', 'MailService']

  isPublic?: boolean; // @Public() 등 public 마커 감지 결과
};

function mapRequestMethod(m?: number): string | undefined {
  if (m == null) return undefined;
  return RequestMethod[m]; // e.g. 1 -> 'GET'
}

function joinPath(a?: string | string[], b?: string | string[]) {
  const norm = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? '';
  const A = norm(a),
    B = norm(b);
  const s = `/${[A, B]
    .map(x => (x || '').replace(/^\/|\/$/g, ''))
    .filter(Boolean)
    .join('/')}`;
  return s === '/' ? undefined : s;
}

/** 프로토타입 체인의 "자기 자신의" 함수 메서드 이름만 수집 (부모 Object 제외) */
function listOwnMethodNames(prototype: any): string[] {
  if (!prototype) return [];
  return Object.getOwnPropertyNames(prototype).filter(
    name => name !== 'constructor' && typeof prototype[name] === 'function'
  );
}

@Injectable()
export class SpecPilotScanner {
  private readonly logger = new Logger(SpecPilotScanner.name);
  private readonly map = new Map<string, CollectedRoute>(); // key: Controller.method

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    @Inject(SPEC_PILOT_OPTIONS) private readonly opts: SpecPilotModuleOptions
  ) {}

  /**
   * 앱에 등록된 컨트롤러 중, @SpecPilot가 붙은 "핸들러"만 수집한다.
   * - HTTP 메서드/경로: Nest 라우팅 메타에서 추출
   * - Guard: 컨트롤러/핸들러 레벨 모두 확인
   * - ParamTypes: handler의 design:paramtypes (reflect-metadata + emitDecoratorMetadata 필요)
   * - injectedTypes: 컨트롤러 생성자 파라미터 타입명(서비스 추적 힌트용)
   */
  scan(): CollectedRoute[] {
    const controllers = this.discovery.getControllers();

    for (const wrapper of controllers) {
      const instance = wrapper.instance;
      if (!instance) continue; // 아직 인스턴스화 안 된 경우
      const proto = Object.getPrototypeOf(instance);
      if (!proto) continue;

      const controllerName = proto?.constructor?.name ?? 'UnknownController';
      const ctrlPath = Reflect.getMetadata(PATH_METADATA, proto?.constructor);

      // 컨트롤러 생성자 주입 타입 → 서비스 타입 힌트
      const injectedTypes: string[] =
        (Reflect as any)
          .getMetadata?.('design:paramtypes', proto?.constructor)
          ?.map((t: any) => t?.name)
          .filter(Boolean) ?? [];

      // 프로토타입의 "자기 메서드"만 열거
      for (const methodName of listOwnMethodNames(proto)) {
        const handler = proto[methodName];

        // (1) @SpecPilot 메타가 있는 핸들러만 대상
        const opts = this.reflector.get(SPEC_PILOT_META, handler) as
          | SpecPilotOptions
          | undefined;
        if (!opts) continue;

        // (2) HTTP 메타
        const routePath = Reflect.getMetadata(PATH_METADATA, handler);
        const methodNum = Reflect.getMetadata(METHOD_METADATA, handler) as
          | number
          | undefined;
        const method = mapRequestMethod(methodNum);
        const path = joinPath(ctrlPath, routePath);

        // (3) Guard 유무 (핸들러/컨트롤러 레벨)
        const guards =
          this.reflector.getAllAndOverride<any[]>(GUARDS_METADATA, [
            handler,
            proto.constructor,
          ]) ?? [];
        const hasGuards = guards.length > 0;

        // public 마커(@Public() 등) 감지
        const keys = this.opts.policy?.publicMetaKeys ?? [
          'isPublic',
          'public',
          'allowAnonymous',
        ];
        const isPublic = keys.some(
          k =>
            this.reflector.getAllAndOverride<any>(k as any, [
              handler,
              proto.constructor,
            ]) === true ||
            Reflect.getMetadata?.(k, handler) === true ||
            Reflect.getMetadata?.(k, proto.constructor) === true
        );

        // (4) 파라미터 타입 (정확도를 높이려면 앱 엔트리에서 `import 'reflect-metadata'`)
        const paramTypes =
          (Reflect as any).getMetadata?.(
            'design:paramtypes',
            proto,
            methodName
          ) ?? [];

        const key = `${controllerName}.${methodName}`;
        this.map.set(key, {
          controllerName,
          methodName,
          http: { method, path },
          options: opts,
          hasGuards,
          paramTypes,
          injectedTypes,
          isPublic,
        });
      }
    }

    const arr = [...this.map.values()];
    this.logger.log(`SpecPilot: collected ${arr.length} decorated handlers.`);
    return arr;
  }

  getByKey(key: string) {
    return this.map.get(key);
  }
  getAll() {
    return [...this.map.values()];
  }
}
