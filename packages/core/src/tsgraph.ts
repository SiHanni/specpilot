// 목적: 컨트롤러 클래스/핸들러를 찾아 서비스 메서드까지 정적으로 추적하고,
//       사이클로매틱 복잡도와 N+1 의심 패턴을 이슈로 반환.
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import fs from 'node:fs';
import {
  Project,
  SyntaxKind,
  Node,
  ClassDeclaration,
  MethodDeclaration,
  CallExpression,
} from 'ts-morph';
import { isOrmFetchName, terminalPropertyName } from './orm-signatures';

export type FeedbackIssue = {
  code: string; // 예: SP101
  severity: 'info' | 'warn' | 'error';
  message: string;
  hint?: string;
};

function findTsConfig(cwd: string): string | null {
  const candidates = [
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.base.json',
    'tsconfig.build.json',
  ].map(p => path.join(cwd, p));
  return candidates.find(f => fs.existsSync(f)) ?? null;
}

/**
 * 컨트롤러 -> 서비스로 이어지는 호출을 정적으로 추적하여
 * - 복잡도(사이클로매틱)
 * - N+1 의심 (루프 내부 await find* / get* / query*)
 * 을 이슈로 반환
 *
 * @param cwd 소비자 앱 루트 (보통 process.cwd())
 * @param controllerName 예: UsersController
 * @param handlerName    예: signUp
 */
export function analyzeControllerToService(
  cwd: string,
  controllerName: string,
  handlerName: string
): FeedbackIssue[] {
  const tsconfig = findTsConfig(cwd);
  const project = tsconfig
    ? new Project({
        tsConfigFilePath: tsconfig,
        skipAddingFilesFromTsConfig: false,
      })
    : new Project({ skipAddingFilesFromTsConfig: true });

  if (!tsconfig) {
    // tsconfig를 못 찾으면 src 전체를 스캔
    const src = path.join(cwd, 'src');
    project.addSourceFilesAtPaths([path.join(src, '**/*.ts')]);
  }

  // 1) 컨트롤러 클래스 찾기
  const controllerDecl = findClassDecl(project, controllerName);
  if (!controllerDecl) {
    return [
      {
        code: 'SP900',
        severity: 'info',
        message: `컨트롤러 ${controllerName}를 소스에서 찾지 못했습니다(정적 분석 생략).`,
      },
    ];
  }

  // 2) 핸들러 찾기
  const handler = controllerDecl.getMethod(handlerName);
  if (!handler) {
    return [
      {
        code: 'SP901',
        severity: 'info',
        message: `컨트롤러 ${controllerName}.${handlerName} 메서드를 찾지 못했습니다(정적 분석 생략).`,
      },
    ];
  }

  // 3) 생성자 파라미터 프로퍼티 → this.<prop> 타입(Service 타입명) 매핑
  const propTypeMap = collectInjectedPropertyTypes(controllerDecl); // prop -> TypeName

  // 4) 핸들러 본문에서 this.<prop>.<serviceMethod>() 호출 탐지
  const serviceCalls = collectServiceCalls(handler, propTypeMap);
  if (serviceCalls.length === 0) {
    return [
      {
        code: 'SP902',
        severity: 'info',
        message: `${controllerName}.${handlerName}에서 서비스 호출(this.<prop>.<method>)을 찾지 못했습니다.`,
      },
    ];
  }

  // 5) 각 서비스 메서드의 복잡도/N+1 의심 검사
  const issues: FeedbackIssue[] = [];
  for (const { serviceType, method } of serviceCalls) {
    const serviceDecl = findClassDecl(project, serviceType);
    if (!serviceDecl) {
      issues.push({
        code: 'SP903',
        severity: 'info',
        message: `서비스 타입 ${serviceType} 선언을 찾지 못했습니다(정적 분석 생략).`,
      });
      continue;
    }

    const target = serviceDecl.getMethod(method);
    if (!target) {
      issues.push({
        code: 'SP904',
        severity: 'info',
        message: `서비스 ${serviceType}.${method} 메서드를 찾지 못했습니다(정적 분석 생략).`,
      });
      continue;
    }

    // 5-1) 복잡도
    const cx = calcCyclomaticComplexity(target);
    if (cx >= 10) {
      issues.push({
        code: 'SP101',
        severity: 'warn',
        message: `서비스 ${serviceType}.${method} 복잡도 높은 편: ${cx}`,
        hint: '분기/루프 분해, early-return, 헬퍼 함수 추출 등을 고려하세요.',
      });
    } else if (cx >= 7) {
      issues.push({
        code: 'SP100',
        severity: 'info',
        message: `서비스 ${serviceType}.${method} 복잡도 중간: ${cx}`,
        hint: '테스트 케이스 분리와 함수 추출로 가독성을 높여보세요.',
      });
    }

    // 5-2) N+1 의심: 루프 내부 await find*/get*/query*
    const n1 = detectNPlusOne(target);
    if (n1.suspect) {
      issues.push({
        code: 'SP201',
        severity: 'warn',
        message: `서비스 ${serviceType}.${method}에서 N+1 의심: 루프 내부에서 '${n1.sampleCall}' 대기(await)`,
        hint: '배치 조회(in / join), preload, 캐시/Map으로 루프 밖에서 준비하는 방식을 고려하세요.',
      });
    }
  }

  return issues;
}

/** 프로젝트 내에서 이름으로 ClassDeclaration 찾기 (src/ 우선) */
function findClassDecl(
  project: Project,
  className: string
): ClassDeclaration | undefined {
  const found = project
    .getSourceFiles()
    .map(sf => ({ sf, cls: sf.getClass(className) }))
    .filter(x => !!x.cls) as Array<{ sf: any; cls: ClassDeclaration }>;
  if (found.length === 0) return undefined;
  found.sort((a, b) => {
    const asrc = String(a.sf.getFilePath()).includes('/src/');
    const bsrc = String(b.sf.getFilePath()).includes('/src/');
    return asrc === bsrc ? 0 : asrc ? -1 : 1;
  });
  return found[0].cls;
}

/** 생성자 파라미터 프로퍼티에서 this.<prop> → 타입명 매핑 수집 */
function collectInjectedPropertyTypes(
  controller: ClassDeclaration
): Map<string, string> {
  const map = new Map<string, string>();
  const ctor = controller.getConstructors()[0];
  if (!ctor) return map;
  for (const p of ctor.getParameters()) {
    // 파라미터 프로퍼티(private readonly fooService: FooService) 형태를 가정
    const name = p.getName();
    const typeName = p.getType().getSymbol()?.getName();
    if (name && typeName) map.set(name, typeName);
  }
  return map;
}

/** 핸들러 본문에서 this.<prop>.<method>() 패턴 수집 */
function collectServiceCalls(
  handler: MethodDeclaration,
  propTypeMap: Map<string, string>
): Array<{ serviceProp: string; serviceType: string; method: string }> {
  const calls: Array<{
    serviceProp: string;
    serviceType: string;
    method: string;
  }> = [];
  handler
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .forEach((call: CallExpression) => {
      const expr = call.getExpression();
      if (!Node.isPropertyAccessExpression(expr)) return;

      // expr: (this.<prop>).<method>
      const callee = expr.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) return;

      const maybeThis = callee.getExpression().getText();
      const prop = callee.getName();
      const method = expr.getName();

      if (maybeThis === 'this' && propTypeMap.has(prop)) {
        const serviceType = propTypeMap.get(prop)!;
        calls.push({ serviceProp: prop, serviceType, method });
      }
    });
  return calls;
}

/** 간이 사이클로매틱 복잡도: 1 + if/for/while/for..of/for..in/catch/switch case/?:/&&/|| */
function calcCyclomaticComplexity(method: MethodDeclaration): number {
  let score = 1;
  method.forEachDescendant(node => {
    switch (node.getKind()) {
      case SyntaxKind.IfStatement:
      case SyntaxKind.ForStatement:
      case SyntaxKind.ForOfStatement:
      case SyntaxKind.ForInStatement:
      case SyntaxKind.WhileStatement:
      case SyntaxKind.CatchClause:
        score++;
        break;
      case SyntaxKind.SwitchStatement:
        node.getChildrenOfKind(SyntaxKind.CaseClause).forEach(() => {
          score++;
        });
        break;
      case SyntaxKind.ConditionalExpression: // a ? b : c
        score++;
        break;
      case SyntaxKind.BinaryExpression: {
        const op = (node as any).getOperatorToken?.().getKind?.();
        if (
          op === SyntaxKind.AmpersandAmpersandToken ||
          op === SyntaxKind.BarBarToken
        )
          score++;
        break;
      }
    }
  });
  return score;
}

/** N+1 의심: 루프 내부 await 호출에서 이름이 find* / get
 * /query* 면 의심 처리
 * */
/** N+1 의심: 루프 내부 await 호출이 ORM/쿼리 fetch 계열이면 의심 처리 */
function detectNPlusOne(method: MethodDeclaration): {
  suspect: boolean;
  sampleCall?: string;
} {
  let suspect = false;
  let sample: string | undefined;

  const loopKinds = new Set<SyntaxKind>([
    SyntaxKind.ForStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.WhileStatement,
  ]);

  method.forEachDescendant(node => {
    if (!loopKinds.has(node.getKind())) return;

    node.forEachDescendant(inner => {
      if (inner.getKind() !== SyntaxKind.AwaitExpression) return;
      const call = inner.getFirstDescendantByKind(SyntaxKind.CallExpression);
      if (!call) return;

      const expr = call.getExpression();
      // case1) obj.method() 형태
      if (Node.isPropertyAccessExpression(expr)) {
        const terminal = terminalPropertyName(expr.getText()) ?? expr.getName();
        if (isOrmFetchName(terminal)) {
          suspect = true;
          sample = expr.getText();
        }
        return;
      }
      // case2) 함수 호출 뒤 체이닝 (드뭄) 등은 간단히 텍스트로 체크
      const txt = call.getText();
      const term = terminalPropertyName(txt);
      if (term && isOrmFetchName(term)) {
        suspect = true;
        sample = txt;
      }
    });
  });

  return { suspect, sampleCall: sample };
}
