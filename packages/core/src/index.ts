/**
 * @fileoverview SpecPilot Core: Engine Base (Type/ Token/ Util)
 *
 */

/** 공통 식별자 (ex: Controller.method 키) */
export type RouteKey = string;

/** 피드백 이슈/ 리포트 */
export type Severity = 'info' | 'warn' | 'error';

export type FeedbackIssue = {
  code: string;
  severity: Severity;
  message: string;
  hint?: string;
};

export type FeedbackReport = {
  routeKey: RouteKey;
  http?: { method?: string; path?: string };
  issues: FeedbackIssue[];
  summary: { info: number; warn: number; error: number };
  generatedAt: string; // ISO
};

export function summarize(issues: FeedbackIssue[]): FeedbackReport['summary'] {
  const base = { info: 0, warn: 0, error: 0 };
  for (const i of issues) base[i.severity]++;
  return base;
}
