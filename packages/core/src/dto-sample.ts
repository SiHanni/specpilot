import path from 'node:path';
import fs from 'node:fs';
import {
  Project,
  ClassDeclaration,
  PropertyDeclaration,
  Decorator,
  Node,
  Type,
  EnumDeclaration,
} from 'ts-morph';

/** ---------- 프로젝트 로딩 유틸 ---------- */
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

/** ---------- 데코레이터/옵션 접근 유틸 ---------- */
function hasDec(p: PropertyDeclaration, names: string[]): boolean {
  const set = new Set(p.getDecorators().map(d => d.getName()));
  return names.some(n => set.has(n));
}

function getDec(p: PropertyDeclaration, name: string): Decorator | undefined {
  return p.getDecorators().find(d => d.getName() === name);
}

function getFirstArg(dec?: Decorator): Node | undefined {
  return dec?.getArguments()?.[0];
}

function getObjectLiteralFromDec(dec?: Decorator): any | undefined {
  const arg = getFirstArg(dec);
  if (!arg) return undefined;
  if (Node.isObjectLiteralExpression(arg)) {
    const obj: Record<string, any> = {};
    for (const prop of arg.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        const key = prop.getName();
        const init = prop.getInitializer();
        obj[key] = getLiteralValue(init);
      }
    }
    return obj;
  }
  return undefined;
}

function getLiteralValue(n?: Node): any {
  if (!n) return undefined;
  if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) {
    return n.getLiteralText();
  }
  if (Node.isNumericLiteral(n)) {
    return Number(n.getText());
  }
  if (Node.isTrueLiteral(n)) return true;
  if (Node.isFalseLiteral(n)) return false;
  if (Node.isArrayLiteralExpression(n)) {
    return n.getElements().map(e => getLiteralValue(e));
  }
  if (Node.isObjectLiteralExpression(n)) {
    const obj: Record<string, any> = {};
    for (const p of n.getProperties()) {
      if (Node.isPropertyAssignment(p)) {
        const key = p.getName();
        obj[key] = getLiteralValue(p.getInitializer());
      }
    }
    return obj;
  }
  // 간단 산술식 (리터럴 + - * / 만) 처리
  if (Node.isBinaryExpression(n)) {
    const l = getLiteralValue(n.getLeft());
    const r = getLiteralValue(n.getRight());
    const op = n.getOperatorToken().getText();
    if (typeof l === 'number' && typeof r === 'number') {
      switch (op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return r === 0 ? undefined : l / r;
      }
    }
  }
  // 그 외는 텍스트 반환(최소한의 안전)
  return undefined;
}

function hasEachTrue(p: PropertyDeclaration): boolean {
  // @IsXxx({ each: true }) 패턴 감지
  for (const d of p.getDecorators()) {
    const obj = getObjectLiteralFromDec(d);
    if (obj && obj.each === true) return true;
  }
  return false;
}

/** ---------- 식별자/문자열 유틸 ---------- */
function isIdentifierSafe(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
function jsStr(v: string): string {
  return JSON.stringify(v);
}

/** ---------- 타입/열거형/유니온 유틸 ---------- */
function isBooleanType(t: Type) {
  return (
    t.getText() === 'boolean' || t.getApparentType().getText() === 'boolean'
  );
}
function isNumberType(t: Type) {
  const tt = t.getApparentType().getText();
  return tt === 'number' || /^(\d+|-\d+)(\.\d+)?$/.test(tt);
}
function isStringType(t: Type) {
  const tt = t.getApparentType().getText();
  return (
    tt === 'string' ||
    tt.startsWith('"') ||
    tt.startsWith("'") ||
    tt.includes('TemplateStringsArray')
  );
}

function isArrayType(t: Type) {
  return !!(
    t.isArray() ||
    t.getText().endsWith('[]') ||
    t.getText().startsWith('Array<')
  );
}
function getArrayElementType(t: Type): Type | undefined {
  if (t.isArray()) return t.getArrayElementTypeOrThrow();
  const text = t.getText();
  if (text.endsWith('[]'))
    return t.getApparentType().getTypeArguments()[0] ?? t;
  if (text.startsWith('Array<')) return t.getTypeArguments()[0];
  return undefined;
}

function isUnionWithNullish(t: Type): boolean {
  const parts = t.isUnion() ? t.getUnionTypes() : [t];
  return parts.some(pt => {
    const txt = pt.getText();
    return txt === 'undefined' || txt === 'null';
  });
}

function isEnumType(t: Type): boolean {
  const sym = t.getSymbol();
  const decl = sym?.getDeclarations()?.[0];
  return !!decl && Node.isEnumDeclaration(decl);
}
function enumFirstValue(t: Type): string | number | undefined {
  const sym = t.getSymbol();
  const decl = sym?.getDeclarations()?.[0];
  if (decl && Node.isEnumDeclaration(decl)) {
    const ed: EnumDeclaration = decl;
    const mem = ed.getMembers()[0];
    if (!mem) return undefined;
    const name = mem.getName();
    const init = mem.getInitializer();
    if (!init) return name; // number enum auto-increment → 이름 사용
    const v = getLiteralValue(init);
    return v ?? name;
  }
  return undefined;
}

/** ---------- class-validator 규칙 해석 ---------- */
type SampleOptions = {
  project: Project;
  maxDepth: number; // nested DTO 생성 깊이 제한
  depth: number;
};

function minLengthFrom(p: PropertyDeclaration): number | undefined {
  const d = getDec(p, 'MinLength') ?? getDec(p, 'Length');
  const arg0 = getFirstArg(d);
  const v = getLiteralValue(arg0);
  return typeof v === 'number' && v >= 0 ? v : undefined;
}
function maxLengthFrom(p: PropertyDeclaration): number | undefined {
  const d = getDec(p, 'MaxLength') ?? getDec(p, 'Length');
  const args = d?.getArguments() ?? [];
  // Length(min, max) 형태에서는 두 번째 인자
  const v = getLiteralValue(args[1]);
  return typeof v === 'number' && v >= 0 ? v : undefined;
}
function minFrom(p: PropertyDeclaration): number | undefined {
  const d = getDec(p, 'Min');
  const v = getLiteralValue(getFirstArg(d));
  return typeof v === 'number' ? v : undefined;
}
function maxFrom(p: PropertyDeclaration): number | undefined {
  const d = getDec(p, 'Max');
  const v = getLiteralValue(getFirstArg(d));
  return typeof v === 'number' ? v : undefined;
}
function isPositive(p: PropertyDeclaration): boolean {
  return !!getDec(p, 'IsPositive');
}
function isNegative(p: PropertyDeclaration): boolean {
  return !!getDec(p, 'IsNegative');
}
function arrayMinSizeFrom(p: PropertyDeclaration): number | undefined {
  const d = getDec(p, 'ArrayMinSize');
  const v = getLiteralValue(getFirstArg(d));
  return typeof v === 'number' && v >= 0 ? v : undefined;
}
function arrayMaxSizeFrom(p: PropertyDeclaration): number | undefined {
  const d = getDec(p, 'ArrayMaxSize');
  const v = getLiteralValue(getFirstArg(d));
  return typeof v === 'number' && v >= 0 ? v : undefined;
}
function arrayNotEmpty(p: PropertyDeclaration): boolean {
  return !!getDec(p, 'ArrayNotEmpty');
}
function isEnumDecorator(
  p: PropertyDeclaration
): { enumTypeName?: string } | null {
  const d = getDec(p, 'IsEnum');
  if (!d) return null;
  const arg0 = getFirstArg(d);
  if (!arg0) return { enumTypeName: undefined };
  const text = arg0.getText().trim();
  return { enumTypeName: text || undefined };
}
function isInValues(p: PropertyDeclaration): any[] | undefined {
  const d = getDec(p, 'IsIn');
  const arg0 = getFirstArg(d);
  if (!arg0) return undefined;
  const v = getLiteralValue(arg0);
  return Array.isArray(v) ? v : undefined;
}

function hasValidateNested(p: PropertyDeclaration): boolean {
  return !!getDec(p, 'ValidateNested');
}
function getChildDtoNameFromTypeDecorator(
  p: PropertyDeclaration
): string | undefined {
  // @Type(() => ChildDto)
  const d = getDec(p, 'Type');
  if (!d) return undefined;
  const arg0 = getFirstArg(d);
  if (!arg0) return undefined;
  // 화살표 함수 텍스트 파싱
  const text = arg0.getText();
  // 형태: "() => ChildDto" 또는 "() => [ChildDto]" 등
  const match =
    text.match(/=>\s*([A-Za-z0-9_$.]+)/)?.[1] ??
    text.match(/=>\s*\[\s*([A-Za-z0-9_$.]+)\s*\]/)?.[1];
  return match ?? undefined;
}

/** ---------- 샘플 생성기(핵심) ---------- */
function sampleString(p?: PropertyDeclaration): string {
  const min = p ? minLengthFrom(p) : undefined;
  const max = p ? maxLengthFrom(p) : undefined;
  const base = 'example';
  const n = Math.max(1, min ?? 1);
  const candidate = 'a'.repeat(Math.max(1, n));
  const finalStr =
    max && candidate.length > max
      ? candidate.slice(0, Math.max(1, max))
      : candidate;
  return jsStr(finalStr.length >= (min ?? 1) ? finalStr : base);
}

function sampleNumber(p?: PropertyDeclaration): string {
  let v = 1;
  const min = p ? minFrom(p) : undefined;
  const max = p ? maxFrom(p) : undefined;
  if (min !== undefined) v = Math.max(v, min);
  if (isPositive(p!)) v = Math.max(v, 1);
  if (isNegative(p!)) v = -1;
  if (max !== undefined) v = Math.min(v, max);
  return String(Number.isInteger(v) ? v : Math.floor(v));
}

function sampleBoolean(): string {
  return 'true';
}

function sampleEmail(): string {
  return jsStr('user@example.com');
}
function sampleUUID(): string {
  return jsStr('00000000-0000-4000-8000-000000000000');
}
function sampleISODate(): string {
  return jsStr('2020-01-01T00:00:00.000Z');
}

function sampleFromEnumType(t: Type): string | undefined {
  const v = enumFirstValue(t);
  if (v === undefined) return undefined;
  return typeof v === 'number' ? String(v) : jsStr(String(v));
}

function sampleFromIsIn(values: any[] | undefined): string | undefined {
  if (!values || values.length === 0) return undefined;
  const first = values[0];
  return typeof first === 'number' ? String(first) : jsStr(String(first));
}

function sampleNestedObjectLiteral(
  project: Project,
  className: string,
  depth: number,
  maxDepth: number
): string {
  if (depth >= maxDepth) return '{}'; // 깊이 제한
  const cls = findClassDecl(project, className);
  if (!cls) return '{}';
  const entries: string[] = [];
  for (const prop of cls.getProperties()) {
    if (isOptionalProperty(prop)) continue;
    const key = isIdentifierSafe(prop.getName())
      ? prop.getName()
      : JSON.stringify(prop.getName());
    const value = sampleForProperty(prop, {
      project,
      depth: depth + 1,
      maxDepth,
    });
    entries.push(`${key}: ${value}`);
  }
  return entries.length ? `{\n  ${entries.join(',\n  ')}\n}` : '{}';
}

function isOptionalProperty(prop: PropertyDeclaration): boolean {
  // 1) @IsOptional
  if (hasDec(prop, ['IsOptional'])) return true;
  // 2) TS 옵셔널(prop?:)
  if (prop.hasQuestionToken()) return true;
  // 3) 타입 유니온에 nullish 포함
  if (isUnionWithNullish(prop.getType())) return true;
  // 4) 초기값 존재(서버 기본값 가정 가능)
  if (prop.getInitializer()) return true;
  return false;
}

function sampleForProperty(
  prop: PropertyDeclaration,
  opt: SampleOptions
): string {
  // 0) 특수 포맷 먼저
  if (hasDec(prop, ['IsEmail'])) return sampleEmail();
  if (hasDec(prop, ['IsUUID'])) return sampleUUID();
  if (hasDec(prop, ['IsDateString', 'IsISO8601'])) return sampleISODate();

  // 1) 데코 기반 스칼라
  if (hasDec(prop, ['IsBoolean'])) return sampleBoolean();
  if (hasDec(prop, ['IsInt', 'IsNumber'])) return sampleNumber(prop);
  if (hasDec(prop, ['IsString'])) return sampleString(prop);

  // 2) Enum / In
  const inVals = isInValues(prop);
  if (inVals && inVals.length > 0) {
    const v = sampleFromIsIn(inVals);
    if (v !== undefined) return v;
  }
  const t = prop.getType();
  if (isEnumType(t)) {
    const v = sampleFromEnumType(t);
    if (v !== undefined) return v;
  }

  // 3) 배열
  if (hasDec(prop, ['IsArray']) || isArrayType(t) || hasEachTrue(prop)) {
    // 원소 갯수 결정
    let count = 1;
    const minSz = arrayMinSizeFrom(prop);
    const notEmpty = arrayNotEmpty(prop);
    if (notEmpty) count = Math.max(count, 1);
    if (minSz !== undefined) count = Math.max(count, minSz);

    // 원소 타입 추정
    const elemType =
      getArrayElementType(t) ?? // 타입 시스템 기반
      t.getApparentType().getTypeArguments()[0]; // fallback

    // 원소 샘플
    const elemSample = (() => {
      // 각 원소에 붙는 검증: @IsString({ each:true }) 등
      // 간단화: 프로퍼티 수준 데코에서 추정
      if (hasDec(prop, ['IsString'])) return sampleString();
      if (hasDec(prop, ['IsInt', 'IsNumber'])) return sampleNumber(prop);
      if (hasDec(prop, ['IsBoolean'])) return sampleBoolean();

      // enum/union/기타 타입 기반
      if (elemType && isEnumType(elemType)) {
        const v = sampleFromEnumType(elemType);
        if (v !== undefined) return v;
      }
      if (elemType && isStringType(elemType)) return sampleString();
      if (elemType && isNumberType(elemType)) return sampleNumber();
      if (elemType && isBooleanType(elemType)) return sampleBoolean();

      // nested DTO 배열인지: @Type(() => ChildDto)
      const child = getChildDtoNameFromTypeDecorator(prop);
      if (child) {
        const nested = sampleNestedObjectLiteral(
          opt.project,
          child,
          opt.depth,
          opt.maxDepth
        );
        return nested;
      }
      return '{}'; // 알 수 없으면 객체 원소
    })();

    const elems = Array.from({ length: Math.max(1, count) }, () => elemSample);
    return `[ ${elems.join(', ')} ]`;
  }

  // 4) Nested DTO (단일 객체)
  if (hasValidateNested(prop)) {
    const child = getChildDtoNameFromTypeDecorator(prop);
    if (child) {
      return sampleNestedObjectLiteral(
        opt.project,
        child,
        opt.depth,
        opt.maxDepth
      );
    }
  }

  // 5) 타입 힌트(마지막 방어선)
  if (isStringType(t)) return sampleString(prop);
  if (isNumberType(t)) return sampleNumber(prop);
  if (isBooleanType(t)) return sampleBoolean();

  // 알 수 없으면 문자열 기본
  return jsStr('example');
}

/** ---------- 퍼블릭 API ---------- */
/**
 * DTO 클래스 이름을 받아 최소 유효 페이로드(object literal 코드 문자열)를 생성
 */
export function generateDtoSampleLiteral(
  cwd: string,
  dtoClassName: string,
  options?: { maxDepth?: number }
): { ok: boolean; code: string } {
  const project = loadProject(cwd);
  const cls = findClassDecl(project, dtoClassName);
  if (!cls) return { ok: false, code: '{}' };

  const entries: string[] = [];
  const maxDepth = options?.maxDepth ?? 2;
  const samplerOpt: SampleOptions = { project, depth: 0, maxDepth };

  for (const prop of cls.getProperties()) {
    // 필수/옵셔널 판단(확장)
    if (isOptionalProperty(prop)) continue;

    const name = prop.getName();
    const key = isIdentifierSafe(name) ? name : JSON.stringify(name);
    const value = sampleForProperty(prop, samplerOpt);
    entries.push(`${key}: ${value}`);
  }

  const code = entries.length ? `{\n  ${entries.join(',\n  ')}\n}` : '{}';
  return { ok: true, code };
}
