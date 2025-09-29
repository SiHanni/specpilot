// 목적: 컨트롤러 핸들러 본문에서 `this.<serviceProp>.<method>(...)` 형태의
//       "첫 번째 서비스 호출"을 찾아 serviceProp / serviceType / method를 반환
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import fs from 'node:fs';
import {
  Project,
  ClassDeclaration,
  MethodDeclaration,
  SyntaxKind,
  Node,
  PropertyAccessExpression,
  ConstructorDeclaration,
} from 'ts-morph';

function findTsConfig(cwd: string): string | null {
  const candidates = [
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.base.json',
  ].map(p => path.join(cwd, p));
  return candidates.find(f => fs.existsSync(f)) ?? null;
}

function loadProject(cwd: string): Project {
  const tsconfig = findTsConfig(cwd);
  if (tsconfig)
    return new Project({
      tsConfigFilePath: tsconfig,
      skipAddingFilesFromTsConfig: false,
    });
  const p = new Project({ skipAddingFilesFromTsConfig: true });
  p.addSourceFilesAtPaths(path.join(cwd, 'src', '**/*.ts'));
  return p;
}

function findClassDecl(
  p: Project,
  className: string
): ClassDeclaration | undefined {
  for (const sf of p.getSourceFiles()) {
    const k = sf.getClass(className);
    if (k) return k;
  }
  return undefined;
}

function propTypeName(
  klass: ClassDeclaration,
  propName: string
): string | undefined {
  // class property
  const prop = klass.getProperty(propName);
  const t1 = prop?.getType().getSymbol()?.getName();
  if (t1) return t1;

  // constructor param
  const ctor: ConstructorDeclaration | undefined = klass.getConstructors()[0];
  const param = ctor?.getParameters().find(p => p.getName() === propName);
  const t2 = param?.getType().getSymbol()?.getName();
  return t2;
}

export type FirstServiceCall = {
  serviceProp: string; // 예: 'usersService'
  serviceType?: string; // 예: 'UsersService' (없을 수도 있음)
  method: string; // 예: 'create'
};

/** 컨트롤러 핸들러에서 발견되는 첫 번째 `this.<prop>.<method>(...)` 호출을 반환 */
export function getFirstServiceCall(
  cwd: string,
  controllerName: string,
  handlerName: string
): FirstServiceCall | null {
  const project = loadProject(cwd);
  const klass = findClassDecl(project, controllerName);
  if (!klass) return null;

  const method: MethodDeclaration | undefined = klass.getMethod(handlerName);
  if (!method) return null;

  let result: FirstServiceCall | null = null;

  method.forEachDescendant(n => {
    if (result) return; // 첫 번째만
    if (n.getKind() !== SyntaxKind.CallExpression) return;

    const call = n.asKind(SyntaxKind.CallExpression)!;
    const expr = call.getExpression();

    if (!Node.isPropertyAccessExpression(expr)) return;

    // expr: something.method  (something이 this.<prop> 이어야 함)
    const methodName = (expr as PropertyAccessExpression).getName();
    const target = (expr as PropertyAccessExpression).getExpression();

    if (!Node.isPropertyAccessExpression(target)) return;
    const targetName = target.getName();

    const root = target.getExpression();
    if (!Node.isThisExpression(root)) return;

    // this.<serviceProp>.<method>(...)
    const serviceProp = targetName;
    const serviceType = propTypeName(klass, serviceProp);

    result = { serviceProp, serviceType, method: methodName };
  });

  return result;
}
