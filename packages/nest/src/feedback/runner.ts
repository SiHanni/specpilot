// 목적: (1) 컨트롤러 측 기본 피드백(Guard/DTO) 생성
//       (2) core 엔진(analyzeControllerToService) 호출로 서비스 분석(복잡도/N+1)
//       (3) JSON 리포트 파일로 저장 (.specpilot/reports/*.json)
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';
import {
  makeReport,
  analyzeControllerToService,
  detectSwaggerUsage,
  detectAuthContextUsage,
} from '@specpilot/core';
import { writeSpecSkeleton } from 'src/testing/spec-writer.js';
import type { CollectedRoute } from '../services/scanner.service.js';
import { SpecPilotModuleOptions } from 'src/tokens.js';

//--- 내부 유틸: JSON 리포트 파일 저장 ---
function writeReportToFs(
  cwd: string,
  report: ReturnType<typeof makeReport>,
  opts?: SpecPilotModuleOptions
) {
  const dir = opts?.reportDir ?? '.specpilot/reports';
  const outDir = path.join(cwd, dir);
  fs.mkdirSync(outDir, { recursive: true });
  const safe = report.routeKey.replace(/\W+/g, '_');
  const file = path.join(outDir, `${safe}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

function isSensitiveGetPath(p?: string) {
  if (!p) return false;
  const lower = p.toLowerCase();
  // 아주 보편적인 민감 경로 힌트 (필요 시 후속 단계에서 설정화)
  return [
    '/me',
    '/my',
    '/profile',
    '/account',
    '/settings',
    '/admin',
    '/dashboard',
    '/billing',
    '/orders',
    '/payments',
    '/users/me',
    '/private',
  ].some(seg => lower.includes(seg));
}

//--- 컨트롤러 측 기본 피드백(Guard / DTO) ---
function basicControllerIssues(
  route: CollectedRoute,
  opts?: SpecPilotModuleOptions
) {
  const issues: Array<{
    code: string;
    severity: 'info' | 'warn' | 'error';
    message: string;
    hint?: string;
  }> = [];
  const m = (route.http?.method ?? '').toUpperCase();

  // Swagger 권고: 전혀 안 쓰고 있으면 정보 레벨 권고
  //  - ApiOperation/ApiResponse/ApiTags 중 하나도 없으면 SP003
  const sw = detectSwaggerUsage(
    process.cwd(),
    route.controllerName,
    route.methodName
  );
  if (sw) {
    const none = !sw.hasApiOperation && !sw.hasApiResponse && !sw.hasApiTags;
    if (none) {
      issues.push({
        code: 'SP003',
        severity: 'info',
        message: 'Swagger 데코레이터가 보이지 않습니다.',
        hint: '@ApiTags(컨트롤러), @ApiOperation/@ApiResponse(핸들러) 도입을 권장합니다.',
      });
    }
    // (옵션) 인증 필요 추정인데 ApiBearerAuth가 없다면 경고
    const looksProtected =
      !route.isPublic &&
      (route.hasGuards ||
        (m === 'GET' && isSensitiveGetPath(route.http?.path)));
    if (looksProtected && !sw.hasApiBearerAuth) {
      issues.push({
        code: 'SP006',
        severity: 'warn',
        message: '인증이 필요한 라우트로 보이지만 @ApiBearerAuth가 없습니다.',
        hint: 'Swagger 문서에 인증 스킴을 노출하려면 @ApiBearerAuth()를 추가하세요.',
      });
    }
  }

  // 인증 컨텍스트 사용 + public 아님 + Guard 없음
  const au = detectAuthContextUsage(
    process.cwd(),
    route.controllerName,
    route.methodName
  );
  if (au) {
    const usesAuthContext =
      au.usesReqUser || au.hasCurrentUserDecorator || au.hasAuthLikeParamType;
    if (usesAuthContext && !route.isPublic && !route.hasGuards) {
      issues.push({
        code: 'SP007',
        severity: 'warn',
        message:
          '핸들러가 인증 컨텍스트(req.user / @CurrentUser) 를 사용하지만 Guard가 없습니다.',
        hint: '@UseGuards(AuthGuard) 또는 접근 제어를 명시하세요. public 라우트라면 @Public() 등을 표시하세요.',
      });
    }
  }

  // GET이라도 민감 경로이고 public 마커가 없으면 가드 권고
  if (
    m === 'GET' &&
    !route.isPublic &&
    isSensitiveGetPath(route.http?.path) &&
    !route.hasGuards
  ) {
    issues.push({
      code: 'SP001',
      severity: 'warn',
      message: '민감한 GET 라우트로 보이지만 Guard가 없습니다.',
      hint: '@UseGuards(AuthGuard) 또는 컨트롤러/핸들러 레벨의 접근 제어를 고려하세요. public 라우트라면 @Public() 등 명시적 표시를 권장합니다.',
    });
  }

  const isWrite = m && m !== 'GET';
  if (isWrite && !route.hasGuards) {
    issues.push({
      code: 'SP001',
      severity: 'warn',
      message: '쓰기(비-GET) 라우트에 인증/인가 Guard가 보이지 않습니다.',
      hint: '@UseGuards(AuthGuard) 또는 컨트롤러 레벨 가드를 고려하세요.',
    });
  }

  // DTO 권고: POST/PUT/PATCH인데 핸들러 파라미터가 전부 원시/미상 타입이면 경고
  const PRIMS = new Set<any>([
    String,
    Number,
    Boolean,
    Array,
    Object,
    undefined,
    null,
  ]);
  if (['POST', 'PUT', 'PATCH'].includes(m)) {
    const types = route.paramTypes ?? [];
    const hasDto = types.some(t => t && !PRIMS.has(t));
    if (!hasDto) {
      issues.push({
        code: 'SP002',
        severity: 'warn',
        message: '본문을 받는 라우트처럼 보이나 DTO 클래스가 보이지 않습니다.',
        hint: 'class-validator 데코레이터가 붙은 DTO를 정의하고 핸들러 파라미터 타입으로 지정하세요.',
      });
    }
  }

  // Swagger 미사용 감지는 다음 조각에서 스캐너 확장으로 추가 예정.
  return issues;
}

// 테스트 생성 게이트: 설정에 따라 스킵
async function maybeGenerateTest(
  cwd: string,
  route: CollectedRoute,
  opts: SpecPilotModuleOptions
) {
  // generateTest가 명시적으로 false면 완전 스킵
  if (route.options && route.options.generateTest === false) {
    return '(skipped by config)';
  }

  const { filePath, created } = writeSpecSkeleton(cwd, route, opts);
  return created ? filePath : '(exists)';
}

//--- 공개 함수: 단일 라우트에 대한 피드백 실행 + 파일 저장 ---
export async function runFeedbackForRoute(
  cwd: string,
  route: CollectedRoute,
  opts: SpecPilotModuleOptions
) {
  if (route.options && route.options.feedback === false) {
    return {
      file: '(skipped)',
      report: makeReport(
        `${route.controllerName}.${route.methodName}`,
        [],
        route.http
      ),
    };
  }

  const controllerIssues = basicControllerIssues(route, opts);
  const serviceIssues = analyzeControllerToService(
    cwd,
    route.controllerName,
    route.methodName
  );
  const issues = [...controllerIssues, ...serviceIssues];

  const report = makeReport(
    `${route.controllerName}.${route.methodName}`,
    issues,
    route.http
  );
  const file = writeReportToFs(cwd, report, opts);

  void maybeGenerateTest(cwd, route, opts);

  return { file, report };
}
