// 목적: ts-morph로 DTO 클래스의 프로퍼티와 class-validator 데코레이터를 읽어
//       최소 유효 페이로드(object literal 문자열)를 생성합니다.
import path from 'node:path';
import fs from 'node:fs';
import {
  Project,
  ClassDeclaration,
  SyntaxKind,
  PropertyDeclaration,
  Decorator,
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

function hasDec(p: PropertyDeclaration, names: string[]): boolean {
  const set = new Set(p.getDecorators().map(d => d.getName()));
  return names.some(n => set.has(n));
}

function getDec(p: PropertyDeclaration, name: string): Decorator | undefined {
  return p.getDecorators().find(d => d.getName() === name);
}

function isIdentifierSafe(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function str(v: string): string {
  return JSON.stringify(v);
}

function sampleForProperty(prop: PropertyDeclaration): string {
  // 기본 규칙 매핑
  if (hasDec(prop, ['IsEmail'])) return str('user@example.com');
  if (hasDec(prop, ['IsUUID']))
    return str('00000000-0000-4000-8000-000000000000');
  if (hasDec(prop, ['IsDateString'])) return str('2020-01-01T00:00:00.000Z');

  if (hasDec(prop, ['IsInt'])) return '1';
  if (hasDec(prop, ['IsNumber'])) return '1';
  if (hasDec(prop, ['IsBoolean'])) return 'true';

  // IsString + MinLength
  if (hasDec(prop, ['IsString'])) {
    const min = getDec(prop, 'MinLength');
    if (min) {
      const arg = min.getArguments()[0]?.getText() ?? '1';
      const n = Math.max(
        parseInt(String(eval(arg) as unknown) || '1', 10) || 1,
        1
      );
      return str('a'.repeat(n));
    }
    return str('example');
  }

  // 배열
  if (hasDec(prop, ['IsArray'])) {
    // element hint: @IsString({ each: true }) 등은 단순화
    if (hasDec(prop, ['IsString'])) return '[ "example" ]';
    if (hasDec(prop, ['IsInt', 'IsNumber'])) return '[ 1 ]';
    if (hasDec(prop, ['IsBoolean'])) return '[ true ]';
    return '[]';
  }

  // 마지막: 타입 힌트 기반(아주 얕게)
  const t = prop.getType().getText();
  if (t.includes('string')) return str('example');
  if (t.includes('number')) return '1';
  if (t.includes('boolean')) return 'true';
  if (t.includes('[]') || t.startsWith('Array<')) return '[]';

  // 알 수 없으면 빈 문자열
  return str('example');
}

/**
 * DTO 클래스 이름을 받아 최소 유효 페이로드(object literal 코드 문자열)를 생성합니다.
 * - 필수 필드(= IsOptional 없는 필드)만 포함합니다.
 */
export function generateDtoSampleLiteral(
  cwd: string,
  dtoClassName: string
): { ok: boolean; code: string } {
  const project = loadProject(cwd);
  const klass = findClassDecl(project, dtoClassName);
  if (!klass) return { ok: false, code: '{}' };

  const entries: string[] = [];
  for (const prop of klass.getProperties()) {
    // 필수/옵셔널 판단
    const optional = hasDec(prop, ['IsOptional']);
    if (optional) continue;

    const name = prop.getName();
    const key = isIdentifierSafe(name) ? name : JSON.stringify(name);
    const value = sampleForProperty(prop);
    entries.push(`${key}: ${value}`);
  }

  const code = entries.length ? `{\n  ${entries.join(',\n  ')}\n}` : '{}';
  return { ok: true, code };
}
