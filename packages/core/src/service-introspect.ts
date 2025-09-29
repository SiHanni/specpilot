// File: /packages/core/src/service-introspect.ts
// 목적: 서비스.<메서드> 정적 분석(의존 호출/루프/예외/트랜잭션/파라미터·반환 타입).
// 개선점(B):
// - getProject/클래스 조회 캐시 사용 → 재파싱 제거
// - 분석 결과 자체도 TTL 캐시(기본 15초)

import {
  Project,
  MethodDeclaration,
  Node,
  SyntaxKind,
  CallExpression,
  PropertyAccessExpression,
  NewExpression,
  ThrowStatement,
} from 'ts-morph';
import { getProject, findClassDeclCached } from './project-cache.js';

export type ServiceCallSite = {
  receiver: string;
  method: string;
  inLoop: boolean;
  snippet?: string;
};

export type ServiceMethodAnalysis = {
  className: string;
  methodName: string;
  paramCount: number;
  paramTypeTexts: string[];
  returnTypeText: string;
  calls: ServiceCallSite[];
  exceptionHints: string[];
  throwsDetected: string[];
  usesTransaction: boolean;
};

// ── 모듈 내부 캐시 ───────────────────────────────────────────────
type CacheEntry = { at: number; value: ServiceMethodAnalysis | null };
const ANALYSIS_CACHE = new Map<string, CacheEntry>();
const TTL_MS = 15_000; // 15초: 같은 런 사이클 내 반복 호출 최적화

function isInLoop(n: Node): boolean {
  let cur: Node | undefined = n;
  while (cur) {
    const k = cur.getKind();
    if (
      k === SyntaxKind.ForStatement ||
      k === SyntaxKind.ForOfStatement ||
      k === SyntaxKind.ForInStatement ||
      k === SyntaxKind.WhileStatement ||
      k === SyntaxKind.DoStatement
    )
      return true;
    cur = cur.getParent();
  }
  return false;
}

function scanImportedExceptionsFromFileText(
  p: Project,
  sfPath: string
): string[] {
  const sf = p.getSourceFile(sfPath);
  if (!sf) return [];
  const names: string[] = [];
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue() !== '@nestjs/common') continue;
    for (const n of imp.getNamedImports()) {
      const nm = n.getName();
      if (nm.endsWith('Exception')) names.push(nm);
    }
  }
  return names;
}

export function clearServiceAnalysisCache() {
  ANALYSIS_CACHE.clear();
}

/** 메인 진입점 */
export function analyzeServiceMethod(
  cwd: string,
  serviceClassName: string,
  methodName: string
): ServiceMethodAnalysis | null {
  const key = `${cwd}::${serviceClassName}::${methodName}`;
  const now = Date.now();
  const hit = ANALYSIS_CACHE.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const project = getProject(cwd);
  const { klass, sf } = findClassDeclCached(cwd, serviceClassName);
  if (!klass || !sf) {
    ANALYSIS_CACHE.set(key, { at: now, value: null });
    return null;
  }

  const method: MethodDeclaration | undefined = klass.getMethod(methodName);
  if (!method) {
    ANALYSIS_CACHE.set(key, { at: now, value: null });
    return null;
  }

  const calls: ServiceCallSite[] = [];
  const throwsDetected = new Set<string>();
  let usesTransaction = false;

  method.forEachDescendant(n => {
    if (n.getKind() === SyntaxKind.CallExpression) {
      const call = n.asKind(SyntaxKind.CallExpression) as CallExpression;
      const expr = call.getExpression();
      const callText = expr.getText();
      if (
        /\.transaction\s*\(/.test(callText) ||
        /manager\.transaction\s*\(/.test(callText)
      ) {
        usesTransaction = true;
      }
      if (Node.isPropertyAccessExpression(expr)) {
        const mName = (expr as PropertyAccessExpression).getName();
        const target = (expr as PropertyAccessExpression).getExpression();
        if (Node.isPropertyAccessExpression(target)) {
          const receiver = target.getName();
          const root = target.getExpression();
          if (Node.isThisExpression(root)) {
            calls.push({
              receiver,
              method: mName,
              inLoop: isInLoop(n),
              snippet: call.getText().slice(0, 140),
            });
          }
        }
      }
    }
    if (n.getKind() === SyntaxKind.NewExpression) {
      const ne = n.asKind(SyntaxKind.NewExpression) as NewExpression;
      const name = ne.getExpression().getText();
      if (name.endsWith('Exception')) throwsDetected.add(name);
    }
    if (n.getKind() === SyntaxKind.ThrowStatement) {
      const th = n.asKind(SyntaxKind.ThrowStatement) as ThrowStatement;
      const ne = th.getExpression()?.asKind(SyntaxKind.NewExpression);
      if (ne) {
        const name = ne.getExpression().getText();
        if (name.endsWith('Exception')) throwsDetected.add(name);
      }
    }
  });

  // 타입 텍스트
  const paramTypeTexts = method.getParameters().map(p => p.getType().getText());
  let returnTypeText = '';
  try {
    returnTypeText = method.getReturnType().getText();
  } catch {
    returnTypeText = '';
  }

  // 예외 힌트(import) — 이미 열린 sf에서 추출
  const exceptionHints = scanImportedExceptionsFromFileText(
    project,
    sf.getFilePath()
  );

  const value: ServiceMethodAnalysis = {
    className: serviceClassName,
    methodName,
    paramCount: paramTypeTexts.length,
    paramTypeTexts,
    returnTypeText,
    calls,
    exceptionHints,
    throwsDetected: Array.from(throwsDetected),
    usesTransaction,
  };

  ANALYSIS_CACHE.set(key, { at: now, value });
  return value;
}
