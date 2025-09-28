// 목적: N+1 의심 탐지 시, ORM/쿼리 호출로 "데이터 페치" 가능성이 큰 이름/패턴을 식별
export function isOrmFetchName(name: string): boolean {
  const n = name.toLowerCase();
  // 공통 키워드
  if (n.startsWith('find') || n.startsWith('get') || n.includes('query'))
    return true;
  // TypeORM Repository/Manager 메서드
  if (
    [
      'find',
      'findone',
      'findby',
      'findandcount',
      'findbyids',
      'findoneby',
      'findonebyorfail',
      'query',
      'count',
      'findoptions',
      'getmany',
      'getone',
    ].some(k => n.includes(k))
  )
    return true;
  // Prisma Client
  if (
    n.includes('findmany') ||
    n.includes('findfirst') ||
    n.includes('findunique') ||
    n.includes('count')
  )
    return true;
  return false;
}

/** createQueryBuilder(...).getMany()/getOne() 같은 체이닝 표현식의 끝 이름을 추출 */
export function terminalPropertyName(exprText: string): string | null {
  // 예: this.repo.createQueryBuilder('u').leftJoin(...).getMany()
  const m = /\.([a-zA-Z0-9_]+)\s*\(\s*\)\s*$/.exec(exprText);
  return m ? m[1] : null;
}
