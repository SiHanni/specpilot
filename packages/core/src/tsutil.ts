// 목적: ts-morph로 프로젝트 내에서 특정 클래스 이름을 가진 선언의 파일 경로를 찾아서 반환
/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'node:path';
import fs from 'node:fs';
import { Project, ClassDeclaration } from 'ts-morph';

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

/**
 * 주어진 클래스명이 선언된 소스 파일의 "절대 경로"를 반환합니다.
 * 찾지 못하면 null을 반환합니다.
 */
export function resolveClassFileAbs(
  cwd: string,
  className: string
): string | null {
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

  const cls = findClassDecl(project, className);
  return cls ? cls.getSourceFile().getFilePath() : null;
}
