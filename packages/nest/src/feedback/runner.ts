// 목적: 라우트별 리포트 저장 + 테스트 파일 생성/병합(upsert).
import fs from 'node:fs';
import path from 'node:path';

import type { CollectedRoute } from '../services/scanner.service';
import type { SpecPilotModuleOptions } from '../tokens';
import { withDefaults } from '../tokens';

import {
  makeReport,
  analyzeControllerToService,
  getFirstServiceCall,
} from '@specpilot/core';
import type { FeedbackIssue } from '@specpilot/core';

import { upsertControllerSpec } from '../testing/spec-writer';
import { upsertServiceSpec } from '../testing/service-spec-writer';

// ──────────────────────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────────────────────
function basicControllerIssues(
  route: CollectedRoute,
  _opts?: SpecPilotModuleOptions
): FeedbackIssue[] {
  const issues: FeedbackIssue[] = [];

  const method = route.http?.method?.toUpperCase?.() ?? '';
  const isWrite =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE';
  const hasGuards = !!(route as any).hasGuards;

  if (isWrite && !hasGuards) {
    issues.push({
      code: 'SP001',
      severity: 'warn',
      message: '쓰기 메서드인데 Guard가 없습니다.',
    });
  }

  const hasDto =
    Array.isArray((route as any).paramTypes) &&
    ((route as any).paramTypes as any[]).some(
      t =>
        t &&
        t.name &&
        t.name !== 'Object' &&
        t.name !== 'Array' &&
        t.name !== 'Promise'
    );
  if (
    !hasDto &&
    (method === 'POST' || method === 'PUT' || method === 'PATCH')
  ) {
    issues.push({
      code: 'SP002',
      severity: 'warn',
      message: '변경 메서드인데 DTO가 감지되지 않았습니다.',
    });
  }

  return issues;
}

// ──────────────────────────────────────────────────────────────────────────────
async function maybeUpsertControllerSpec(
  cwd: string,
  route: CollectedRoute,
  opts: Required<SpecPilotModuleOptions>
) {
  if ((route as any).options?.generateTest === false)
    return '(skipped by route)';
  if (!opts.generateControllerTests) return '(skipped by module)';

  const res = upsertControllerSpec(cwd, route, opts);
  if ((res as any).created) return (res as any).filePath + ' (created)';
  if ((res as any).merged) return (res as any).filePath + ' (merged)';
  return '(no-change)';
}

async function maybeUpsertServiceSpec(
  cwd: string,
  route: CollectedRoute,
  opts: Required<SpecPilotModuleOptions>
) {
  if ((route as any).options?.generateServiceTests === false)
    return '(skipped by route)';
  if (!opts.generateServiceTests) return '(skipped by module)';

  const first = getFirstServiceCall(
    cwd,
    route.controllerName,
    route.methodName
  );
  if (!first?.serviceType || !first?.method) return '(no-first-service-call)';

  const res = upsertServiceSpec(cwd, first.serviceType, first.method, opts);
  if (res.created) return res.filePath + ' (created)';
  if (res.merged) return res.filePath + ' (merged)';
  return '(no-change)';
}

// ──────────────────────────────────────────────────────────────────────────────
export async function runFeedbackForRoute(
  cwd: string,
  route: CollectedRoute,
  opts?: SpecPilotModuleOptions
) {
  const eff = withDefaults(opts);

  if ((route as any).options && (route as any).options.feedback === false) {
    const report = makeReport(
      `${route.controllerName}.${route.methodName}`,
      [],
      route.http
    );
    return { file: '(skipped)', report };
  }

  const controllerIssues = basicControllerIssues(route, opts);
  const serviceIssues = analyzeControllerToService(
    cwd,
    route.controllerName,
    route.methodName
  );
  const issues: FeedbackIssue[] = [...controllerIssues, ...serviceIssues];

  const report = makeReport(
    `${route.controllerName}.${route.methodName}`,
    issues,
    route.http
  );
  const file = writeReportToFs(cwd, report, opts);

  // upsert(생성 or 마커 병합)
  void maybeUpsertControllerSpec(cwd, route, eff);
  void maybeUpsertServiceSpec(cwd, route, eff);

  return { file, report };
}
