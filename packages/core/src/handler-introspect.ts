// 목적: ts-morph로 컨트롤러 핸들러의 파라미터 개수를 조회합니다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import fs from 'node:fs';
import { Project, ClassDeclaration, MethodDeclaration } from 'ts-morph';

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

/** 핸들러의 파라미터 개수를 반환합니다. 찾지 못하면 null. */
export function getHandlerParamCount(
  cwd: string,
  controllerName: string,
  handlerName: string
): number | null {
  const project = loadProject(cwd);
  const klass = findClassDecl(project, controllerName);
  if (!klass) return null;
  const method: MethodDeclaration | undefined = klass.getMethod(handlerName);
  if (!method) return null;
  return method.getParameters().length;
}
