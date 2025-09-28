// 목적: 컨트롤러/핸들러에 Swagger 데코레이터(@ApiOperation/@ApiResponse/@ApiTags/@ApiBearerAuth) 적용되었는지 정적으로 감지해 플래그로 반환
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import fs from 'node:fs';
import { Project, ClassDeclaration, MethodDeclaration } from 'ts-morph';

export type SwaggerUsage = {
  hasApiOperation: boolean;
  hasApiResponse: boolean; // (메서드에 ApiOkResponse/ApiResponse 등도 포함)
  hasApiTags: boolean; // (클래스에 ApiTags)
  hasApiBearerAuth: boolean; // (클래스/메서드 어느 쪽이든)
};

function findTsConfig(cwd: string): string | null {
  const candidates = [
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.base.json',
  ].map(p => path.join(cwd, p));
  return candidates.find(f => fs.existsSync(f)) ?? null;
}

function findClassDecl(
  project: Project,
  className: string
): ClassDeclaration | undefined {
  for (const sf of project.getSourceFiles()) {
    const k = sf.getClass(className);
    if (k) return k;
  }
  return undefined;
}

function getMethod(
  cls: ClassDeclaration,
  name: string
): MethodDeclaration | undefined {
  return cls.getMethod(name);
}

function decNamesFromClass(cls: ClassDeclaration): Set<string> {
  return new Set(cls.getDecorators().map(d => d.getName()));
}

function decNamesFromMethod(m: MethodDeclaration): Set<string> {
  return new Set(m.getDecorators().map(d => d.getName()));
}

/**
 * 컨트롤러/핸들러의 Swagger 데코레이터 사용 여부를 감지합니다.
 * 못 찾으면 null을 반환(상위에서 생략 처리).
 */
export function detectSwaggerUsage(
  cwd: string,
  controllerName: string,
  handlerName: string
): SwaggerUsage | null {
  const tsconfig = findTsConfig(cwd);
  const project = tsconfig
    ? new Project({
        tsConfigFilePath: tsconfig,
        skipAddingFilesFromTsConfig: false,
      })
    : new Project({ skipAddingFilesFromTsConfig: true });

  if (!tsconfig) {
    const src = path.join(cwd, 'src');
    project.addSourceFilesAtPaths([path.join(src, '**/*.ts')]);
  }

  const cls = findClassDecl(project, controllerName);
  if (!cls) return null;

  const method = getMethod(cls, handlerName);
  if (!method) return null;

  const c = decNamesFromClass(cls);
  const m = decNamesFromMethod(method);

  // 메서드 수준: ApiOperation, ApiResponse/ApiOkResponse 등
  const hasApiOperation = m.has('ApiOperation');
  const hasApiResponse = [
    'ApiResponse',
    'ApiOkResponse',
    'ApiCreatedResponse',
    'ApiBadRequestResponse',
    'ApiUnauthorizedResponse',
    'ApiForbiddenResponse',
    'ApiNotFoundResponse',
  ].some(n => m.has(n));

  // 클래스 수준: ApiTags
  const hasApiTags = c.has('ApiTags');

  // 인증 표시: 클래스/메서드 어느 한쪽에라도 ApiBearerAuth 있으면 true
  const hasApiBearerAuth = c.has('ApiBearerAuth') || m.has('ApiBearerAuth');

  return { hasApiOperation, hasApiResponse, hasApiTags, hasApiBearerAuth };
}
