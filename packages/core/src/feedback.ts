/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import path from 'node:path';

export type Severity = 'info' | 'warn' | 'error';

export type FeedbackIssue = {
  code: string; // 규칙 코드 (예: SP001)
  severity: Severity; // info | warn | error
  message: string; // 사람이 읽는 설명
  hint?: string; // 바로 고칠 수 있는 힌트
};

export type FeedbackReport = {
  routeKey: string; // Controller.method
  http?: { method?: string; path?: string };
  issues: FeedbackIssue[];
  summary: { info: number; warn: number; error: number };
  generatedAt: string; // ISO timestamp
};

export function summarize(issues: FeedbackIssue[]): FeedbackReport['summary'] {
  const base = { info: 0, warn: 0, error: 0 };
  for (const i of issues) base[i.severity]++;
  return base;
}

export function makeReport(
  routeKey: string,
  issues: FeedbackIssue[],
  http?: FeedbackReport['http']
): FeedbackReport {
  return {
    routeKey,
    http,
    issues,
    summary: summarize(issues),
    generatedAt: new Date().toISOString(),
  };
}

export function writeReport(cwd: string, report: FeedbackReport) {
  const outDir = path.join(cwd, '.specpilot', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const safe = report.routeKey.replace(/\W+/g, '_');
  const file = path.join(outDir, `${safe}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}
