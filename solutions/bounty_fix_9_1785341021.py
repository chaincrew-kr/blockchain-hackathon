# Technical Overview & Fix

## 1. Problem Statement & Root Cause
In `packages/schema/src/index.ts`, the virtual contract schema explicitly defines `freeTicketCapRate` with the comment:
`/** 무료 발권 상한 비율 (예: 0.05) — STAGE 3 P3 검증과 숫자 일치 필수 */`

However, Agent D's risk check module (`apps/agent/src/risk-check/index.ts`) was initialized using the STAGE 4 recommendation default threshold (10% / 0.10 or 15% / 0.15). This mismatch causes Agent D to evaluate risk against an incorrect threshold during STAGE 3 P3 verification.

## 2. Solution Summary
- Update the default risk threshold constant in `apps/agent/src/risk-check/index.ts` from `0.10` / `0.15` (10%/15%) to `0.05` (5%).
- Ensure comments in both `packages/schema/src/index.ts` and `apps/agent/src/risk-check/index.ts` explicitly reference STAGE 3 P3 compliance.

---

# Code Solution

### File: `apps/agent/src/risk-check/index.ts`

```typescript
/**
 * Agent D Risk Check Verification Module
 * Aligned with STAGE 3 P3 Specification (freeTicketCapRate = 0.05)
 */

/** Agent D 기본 검증 임계값 (STAGE 3 P3 규격: 5% / 0.05) */
export const DEFAULT_FREE_TICKET_CAP_THRESHOLD = 0.05;

export interface RiskCheckConfig {
  freeTicketCapThreshold: number;
  [key: string]: unknown;
}

export const DEFAULT_RISK_CHECK_CONFIG: RiskCheckConfig = {
  /** 무료 발권 상한 비율 검증 임계값 — STAGE 3 P3 규격(0.05)과 일치 */
  freeTicketCapThreshold: DEFAULT_FREE_TICKET_CAP_THRESHOLD,
};

/**
 * Agent D가 가상 계약서의 무료 발권 비율이 허용 임계값을 초과하는지 검증합니다.
 * 
 * @param freeTicketCapRate - 계약서에 기재된 무료 발권 상한 비율
 * @param threshold - 검증 임계값 (기본값: 0.05)
 * @returns 리스크 검증 통과 여부 및 상세 결과
 */
export function validateFreeTicketCapRate(
  freeTicketCapRate: number,
  threshold: number = DEFAULT_FREE_TICKET_CAP_THRESHOLD
): { isValid: boolean; freeTicketCapRate: number; threshold: number; warning?: string } {
  const isValid = freeTicketCapRate <= threshold;
  
  return {
    isValid,
    freeTicketCapRate,
    threshold,
    ...(isValid
      ? {}
      : {
          warning: `무료 발권 비율(${freeTicketCapRate * 100}%)이 STAGE 3 P3 허용 임계값(${threshold * 100}%)을 초과했습니다.`,
        }),
  };
}
```

### File: `packages/schema/src/index.ts`

```typescript
export interface VirtualContractSchema {
  /** 계약 ID */
  id: string;

  /** 무료 발권 상한 비율 (0.05) — STAGE 3 P3 검증과 숫자 일치 필수 */
  freeTicketCapRate: number;

  /** 기타 계약 속성 */
  [key: string]: unknown;
}
```

---

## 3. Verification & Testing

```typescript
import { validateFreeTicketCapRate, DEFAULT_FREE_TICKET_CAP_THRESHOLD } from '../apps/agent/src/risk-check';

describe('Agent D Risk Check Threshold Test', () => {
  it('should default to 0.05 matching STAGE 3 P3 requirements', () => {
    expect(DEFAULT_FREE_TICKET_CAP_THRESHOLD).toBe(0.05);
  });

  it('should pass validation when freeTicketCapRate is <= 0.05', () => {
    const result = validateFreeTicketCapRate(0.05);
    expect(result.isValid).toBe(true);
  });

  it('should fail validation when freeTicketCapRate is > 0.05', () => {
    const result = validateFreeTicketCapRate(0.08);
    expect(result.isValid).toBe(false);
    expect(result.warning).toBeDefined();
  });
});
```