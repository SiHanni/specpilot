<!-- 목적: core 패키지의 역할/입출력/확장 포인트를 문서화 -->

# @specpilot/core

SpecPilot의 **엔진 베이스**

## 역할

- 피드백 리포트/이슈 **타입** 제공: SpecPilot의 공통 타입/유틸 모듈. (이슈/리포트 스키마, 요약 유틸 등)
- 라우트 식별자(RouteKey) 등 **공용 개념 정의**
- 리포트 요약 유틸 등 **엔진 공용 유틸** 제공

## 사용 범위

- 다른 패키지(@specpilot/nest)가 의존
- 소비자 앱은 직접 core를 쓰지 않아도 됨.

### auth-usage.ts

- @SpecPilot() 데코레이터를 사용한 컨트롤러 클래스/ 핸들러 메서드가
- req.user를 직접 참조하는지,
- @CurrentUser() 또는 @AuthUser() 파라미터를 쓰는지,
- 혹은 파라미터 타입명이 User / Auth 계열인지
- 위의 사항을 ts-morph로 정적 분석을 하여 값을 반환
