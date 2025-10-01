/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import fs from 'node:fs';
import { Project, ClassDeclaration, MethodDeclaration, Node } from 'ts-morph';

/**
 * usesReqUser: req.user 또는 request.user 을 사용해 접근하는지 확인
 * hasCurrentUserDecorator: @CurrentUser() / @AuthUser() 를 사용하는지
 * hasAuthLikeParamType: 파라미터 타입명이 User/Auth를 포함하는지
 */
export type AuthUsage = {
  usesReqUser: boolean;
  hasCurrentUserDecorator: boolean;
  hasAuthLikeParamType: boolean;
};

/** AST로 변환하기 위해 tsconfig 관련 파일을 찾음. */
function findTsConfig(cwd: string): string | null {
  const candidates = [
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.base.json',
    'tsconfig.build.json',
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

export function detectAuthContextUsage(
  cwd: string,
  controllerName: string,
  handlerName: string
): AuthUsage | null {
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

  // 파라미터 조사
  const paramNamesPossiblyRequest: string[] = [];
  let hasCurrentUserDecorator = false;
  let hasAuthLikeParamType = false;

  for (const p of method.getParameters()) {
    // 데코레이터 이름 검사
    const decNames = new Set(p.getDecorators().map(d => d.getName()));
    if (decNames.has('CurrentUser') || decNames.has('AuthUser')) {
      hasCurrentUserDecorator = true;
    }

    // 타입명 검사 (User/Auth를 포함하면 인증 컨텍스트로 간주)
    const typeName = p.getType().getSymbol()?.getName() ?? '';
    const tn = typeName.toLowerCase();
    if (tn.includes('user') || tn.includes('auth')) {
      hasAuthLikeParamType = true;
    }

    // Request 파라미터 후보: @Req() 또는 이름/타입으로 추정
    const name = p.getName();
    const looksLikeReqName = ['req', 'request', 'ctx', 'context'].includes(
      name
    );
    const looksLikeReqType = tn.includes('request'); // Express.Request 등
    const hasReqDecorator = decNames.has('Req');

    if (looksLikeReqName || looksLikeReqType || hasReqDecorator) {
      paramNamesPossiblyRequest.push(name);
    }
  }

  // 메서드 본문에서 req.user 접근 여부
  let usesReqUser = false;
  if (paramNamesPossiblyRequest.length > 0) {
    method.forEachDescendant(n => {
      if (!Node.isPropertyAccessExpression(n)) return;
      const obj = n.getExpression().getText();
      const prop = n.getName();
      if (prop === 'user' && paramNamesPossiblyRequest.includes(obj)) {
        usesReqUser = true;
      }
    });
  }

  return {
    usesReqUser,
    hasCurrentUserDecorator,
    hasAuthLikeParamType,
  };
}
