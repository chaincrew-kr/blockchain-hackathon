/**
 * P5 해시 연속성 검증용 이벤트 해시.
 *
 * 규칙: events[i].prevHash === hashTicketEvent(events[i-1]),
 *       첫 이벤트의 prevHash === GENESIS_HASH.
 * ⚠️ 이 산식은 STAGE 1 발권 로그 적재(A·B)와 동일해야 한다 — 변경 시 packages/schema
 *    README와 팀 공유 필수.
 */
import { createHash } from "node:crypto";

import type { TicketEvent } from "@chaincrew/schema";

export const GENESIS_HASH = "0".repeat(64);

export function hashTicketEvent(event: TicketEvent): string {
  const canonical = [
    event.kind,
    event.screeningId,
    event.seat,
    String(event.amount),
    String(event.timestamp),
    event.txSignature,
    event.prevHash,
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
