<!-- 목적: Nest 어댑터의 역할/사용 시점/트리거/2단계 이후 계획을 문서화 -->

# @specpilot/nest

SpecPilot의 **Nest 런타임 어댑터**입니다.  
컨트롤러/핸들러에 `@SpecPilot({...})` 데코레이터를 달면, **개발 환경에서** 런타임에 해당 API를 분석하고 테스트 스켈레톤을 생성합니다.

- NestJS에서 사용하는 데코레이터 + 모듈 옵션 제공.
- @SpecPilot({ feedback, generateTest }) 데코레이터(컨트롤러/핸들러에 부착)
- SpecPilotModule.forRoot({ enabled, outDir, trigger })
- 앱이 실행 중일 때 데코레이터가 붙은 엔드포인트만 골라 분석/테스트 생성을 트리거하기 위함.
- 호환: Nest는 peerDependencies로만 요구(소비자 프로젝트 버전에 맞춤).

## 사용 개요

```ts
// app.module.ts
@Module({
  imports: [
    SpecPilotModule.forRoot({
      enabled: process.env.NODE_ENV !== 'production',
      outDir: 'test',
      trigger: 'first-hit', // 또는 'bootstrap'
    }),
  ],
})
export class AppModule {}
```

```ts
// users.controller.ts
@Controller('users')
export class UsersController {
  @Post('signup')
  @SpecPilot({ feedback: true, generateTest: true })
  async signUp() {
    /* ... */
  }
}
```
