// File: /packages/core/src/exceptions-hints.ts
// 목적: 서비스 클래스 파일에서 사용/임포트되는 Nest 예외를 추정해
//       테스트에서 던질 "대표 예외"를 고른다. (Project 캐시 사용)

import { SyntaxKind } from 'ts-morph';
import { findClassDeclCached } from './project-cache.js';

// 우선순위: 발견되면 그중 최상위 우선순위를 선택
const PRIORITY = [
  'NotFoundException',
  'ConflictException',
  'BadRequestException',
  'UnauthorizedException',
  'ForbiddenException',
  'GoneException',
  'UnprocessableEntityException',
];

export function findLikelyHttpExceptionForClass(
  cwd: string,
  serviceClassName: string
): { name: string; importFrom: string } | null {
  const { klass, sf } = findClassDeclCached(cwd, serviceClassName);
  if (!klass || !sf) return null;

  // 1) import 힌트 수집(@nestjs/common)
  const imported = new Set<string>();
  for (const imp of sf.getImportDeclarations()) {
    if (imp.getModuleSpecifierValue() !== '@nestjs/common') continue;
    for (const n of imp.getNamedImports()) {
      const nm = n.getName();
      if (nm.endsWith('Exception')) imported.add(nm);
    }
  }

  // 2) 코드 내 new <Exception>() 사용 수집
  const constructed = new Set<string>();
  sf.forEachDescendant(node => {
    const ne = node.asKind(SyntaxKind.NewExpression);
    if (!ne) return;
    const name = ne.getExpression().getText();
    if (name.endsWith('Exception')) constructed.add(name);
  });

  // 3) 우선순위에 따라 대표 예외 선택
  for (const name of PRIORITY) {
    if (constructed.has(name) || imported.has(name)) {
      return { name, importFrom: '@nestjs/common' };
    }
  }

  // 4) 그래도 없으면, import된 Exception 중 하나라도 반환
  const any = Array.from(imported.values()).find(n => n.endsWith('Exception'));
  return any ? { name: any, importFrom: '@nestjs/common' } : null;
}
