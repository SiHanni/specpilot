// File: /packages/core/src/project-cache.ts
// 목적: ts-morph Project를 cwd별로 캐싱해 재파싱을 줄인다.
// - getProject(cwd): 같은 프로세스 내에서 재사용
// - invalidateProject(cwd): 수동 무효화
// - findClassDeclCached(cwd, className): 클래스 선언 빠르게 조회(소형 캐시)

import path from 'node:path';
import fs from 'node:fs';
import { Project, ClassDeclaration, SourceFile } from 'ts-morph';

type ProjectEntry = {
  project: Project;
  tsconfig: string | null;
};

const projectMap = new Map<string, ProjectEntry>();
const classDeclCache = new Map<string, { sfPath: string; when: number }>();

function findTsConfig(cwd: string): string | null {
  const cands = [
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.base.json',
  ].map(p => path.join(cwd, p));
  return cands.find(f => fs.existsSync(f)) ?? null;
}

export function getProject(cwd: string): Project {
  const tsconfig = findTsConfig(cwd);
  const key = `${cwd}::${tsconfig ?? 'no-tsconfig'}`;

  const hit = projectMap.get(key);
  if (hit) return hit.project;

  let project: Project;
  if (tsconfig) {
    project = new Project({
      tsConfigFilePath: tsconfig,
      skipAddingFilesFromTsConfig: false,
    });
  } else {
    project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths(path.join(cwd, 'src', '**/*.ts'));
  }

  projectMap.set(key, { project, tsconfig });
  return project;
}

export function invalidateProject(cwd: string) {
  for (const k of projectMap.keys()) {
    if (k.startsWith(`${cwd}::`)) projectMap.delete(k);
  }
}

/** 소형 캐시로 클래스 선언을 빠르게 찾는다. */
export function findClassDeclCached(
  cwd: string,
  className: string
): { klass: ClassDeclaration | null; sf: SourceFile | null } {
  const project = getProject(cwd);

  // 1) 캐시된 파일 경로가 있으면 바로 열어보기
  const key = `${cwd}::${className}`;
  const cached = classDeclCache.get(key);
  if (cached) {
    const sf = project.getSourceFile(cached.sfPath);
    const klass = sf?.getClass(className) ?? null;
    if (klass) return { klass, sf: sf! };
    // 못 찾으면 캐시 무효
    classDeclCache.delete(key);
  }

  // 2) 전체 파일 스캔(최초 1회 또는 캐시 실패 시)
  for (const sf of project.getSourceFiles()) {
    const k = sf.getClass(className);
    if (k) {
      classDeclCache.set(key, { sfPath: sf.getFilePath(), when: Date.now() });
      return { klass: k, sf };
    }
  }
  return { klass: null, sf: null };
}
