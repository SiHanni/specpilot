import { SyntaxKind } from 'ts-morph';
import { findClassDeclCached } from './project-cache';

const PRIORITY = [
  'NotFoundException',
  'ConflictException',
  'BadRequestException',
  'UnauthorizedException',
  'ForbiddenException',
  'GoneException',
  'UnprocessableEntityException',
  'HttpException',
];

export function findLikelyHttpExceptionForClass(
  cwd: string,
  serviceClassName: string
): { name: string; importFrom: string } | null {
  const { cls, sf } = findClassDeclCached(cwd, serviceClassName);
  if (!cls || !sf) return null;

  // 1) import 힌트 수집(@nestjs/common)
  const imported = new Map<string, string>();
  const importedFromCommon = new Set<string>();
  for (const imp of sf.getImportDeclarations()) {
    const mod = imp.getModuleSpecifierValue();
    for (const n of imp.getNamedImports()) {
      const local = n.getNameNode().getText();
      const orig = n.getName();
      if (orig.endsWith('Exception')) {
        imported.set(local, orig);
        if (mod === '@nestjs/common') importedFromCommon.add(local);
      }
    }
  }

  // 2) 코드 내 new <Exception>() 사용 수집
  const constructed = new Map<string, number>(); // name -> weight
  cls.forEachDescendant(node => {
    const newExpr = node.asKind(SyntaxKind.NewExpression);
    if (!newExpr) return;
    const expr = newExpr.getExpression();
    const text = expr.getText(); // NF 혹은 NotFoundException 등
    // 로컬 별칭을 원래 이름으로 보정(텍스트 기반)
    const name = imported.get(text) ?? text;
    if (!name.endsWith('Exception')) return;
    // throw 문맥이면 가중치 2, 아니면 1
    const inThrow = !!node.getFirstAncestorByKind(SyntaxKind.ThrowStatement);
    const weight = (constructed.get(name) ?? 0) + (inThrow ? 2 : 1);
    constructed.set(name, weight);
  });

  // 3) 우선순위에 따라 대표 예외 선택
  for (const name of PRIORITY) {
    if (constructed.has(name) || imported.has(name)) {
      return { name, importFrom: '@nestjs/common' };
    }
  }

  for (const name of PRIORITY) {
    // imported map의 값(orig)와 키(local) 모두 비교
    if ([...imported.keys(), ...imported.values()].includes(name)) {
      // 가능하면 모듈 스펙 '@nestjs/common'로 반환 시멘틱 유지
      return { name, importFrom: '@nestjs/common' };
    }
  }
  // 4) 점수 최고인 예외(우선순위 밖)라도 있으면 채택
  if (constructed.size > 0) {
    const [best] = [...constructed.entries()].sort((a, b) => b[1] - a[1]);
    return { name: best[0], importFrom: '@nestjs/common' };
  }
  // 5) 그래도 없으면 import된 Exception 중 하나
  const anyLocal = [...imported.keys()].find(k =>
    (imported.get(k) ?? k).endsWith('Exception')
  );
  if (anyLocal) {
    const orig = imported.get(anyLocal) ?? anyLocal;
    return { name: orig, importFrom: '@nestjs/common' };
  }

  return null;
}
