export type AutoSpecOptions = {
  feedback?: boolean;
  generateTest?: boolean;
  unit?: boolean;
  e2e?: boolean;
};

// (placeholder) 시그니처만 정의 — 현재는 no-op
export function AutoSpec(
  _opts: AutoSpecOptions = {}
): MethodDecorator & ClassDecorator {
  return () => {
    /* no-op at step1 */
  };
}
