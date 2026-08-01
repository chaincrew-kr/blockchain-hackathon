/** 실제 거래 없이 Devnet Agent 준비 상태를 확인하는 읽기 전용 명령. */
import "dotenv/config";

import { demoBatch } from "../fixtures/screenings.js";
import { netAmountOf } from "../pipeline.js";
import { AnchorChainGateway, createChainGateway } from "./index.js";

async function main(): Promise<void> {
  const setup = createChainGateway();
  if (!(setup.gateway instanceof AnchorChainGateway)) {
    throw new Error(
      "Anchor 환경변수가 완성되지 않아 stub 모드입니다. apps/agent/.env를 확인하세요.",
    );
  }

  const gateway = setup.gateway;
  const [preflight, escrow] = await Promise.all([
    gateway.preflight(),
    gateway.inspectEscrow(),
  ]);
  const requiredPending = demoBatch.reduce(
    (sum, screening) => sum + netAmountOf(screening.events),
    0,
  );
  const pending = escrow?.pending ?? 0;
  const authorityMatches = escrow?.authority === gateway.authority;
  const result = {
    mode: "anchor",
    authority: gateway.authority,
    addresses: gateway.addresses,
    preflight,
    escrow,
    demoRequirement: {
      requiredPending,
      currentPending: pending,
      shortfall: Math.max(0, requiredPending - pending),
    },
    ready:
      preflight.programDeployed &&
      preflight.escrowInitialized &&
      preflight.authorityBalanceLamports > 0 &&
      authorityMatches &&
      pending >= requiredPending,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
