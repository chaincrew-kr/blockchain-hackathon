/**
 * 체인 게이트웨이 선택 — 환경변수가 갖춰지면 실제 온체인, 아니면 스텁.
 *
 * 스텁으로 떨어지는 것 자체는 정상 동작이다(체인 미연결 상태에서도 STAGE 3·4를
 * 개발·시연해야 한다). 다만 **스텁일 때는 트랜잭션이 가짜라는 사실이 로그와
 * `/health`에 드러나야 한다** — 이슈 #18. 진척도를 실제보다 높게 보이게 하는
 * 것이 가장 위험하다.
 */
import { logger } from "../logger.js";
import {
  AnchorChainGateway,
  type BeneficiaryWallets,
} from "./anchor-gateway.js";
import { StubChainGateway, type ChainGateway } from "./gateway.js";

export type ChainMode = "stub" | "anchor";

export interface ChainSetup {
  gateway: ChainGateway;
  mode: ChainMode;
  /** anchor 모드일 때 서명 지갑 공개키 */
  authority?: string;
}

/** anchor 모드에 필요한 환경변수 — 하나라도 비면 스텁으로 떨어진다. */
const REQUIRED = [
  "SOLANA_RPC_URL",
  "SOLANA_PROGRAM_ID",
  "AGENT_KEYPAIR_PATH",
] as const;

/**
 * settle_batch가 Allocation에 기록할 권리자 지갑 — 선택 사항.
 * 없어도 anchor 모드로 뜨지만 settle_batch 호출은 명확한 오류로 거부된다.
 */
const WALLET_ENV = [
  "THEATER_WALLET",
  "DISTRIBUTOR_WALLET",
  "PRODUCER_WALLET",
] as const;

function readBeneficiaryWallets(
  env: NodeJS.ProcessEnv,
): BeneficiaryWallets | undefined {
  const missing = WALLET_ENV.filter((key) => !env[key]);
  if (missing.length === 0) {
    return {
      theater: env.THEATER_WALLET as string,
      distributor: env.DISTRIBUTOR_WALLET as string,
      producer: env.PRODUCER_WALLET as string,
    };
  }
  logger.warn("beneficiary wallets not fully set — settle_batch will refuse", {
    missingEnv: missing,
  });
  return undefined;
}

export function createChainGateway(
  env: NodeJS.ProcessEnv = process.env,
): ChainSetup {
  const missing = REQUIRED.filter((key) => !env[key]);

  if (missing.length > 0) {
    logger.warn("chain gateway falling back to stub — transactions are fake", {
      missingEnv: missing,
      impact: "tx signatures start with STUB_ and nothing reaches Explorer",
    });
    return { gateway: new StubChainGateway(), mode: "stub" };
  }

  try {
    const gateway = new AnchorChainGateway({
      rpcUrl: env.SOLANA_RPC_URL as string,
      programId: env.SOLANA_PROGRAM_ID as string,
      keypairPath: env.AGENT_KEYPAIR_PATH as string,
      beneficiaryWallets: readBeneficiaryWallets(env),
    });
    return { gateway, mode: "anchor", authority: gateway.authority };
  } catch (error) {
    // 키파일 누락·잘못된 program id 등 설정 오류. 서버는 뜨게 두되 스텁으로
    // 내려앉는다 — 데모 도중 서버가 죽는 것보다 낫다.
    logger.error("anchor gateway setup failed, falling back to stub", error);
    return { gateway: new StubChainGateway(), mode: "stub" };
  }
}

export { AnchorChainGateway } from "./anchor-gateway.js";
export { StubChainGateway } from "./gateway.js";
export type { ChainGateway, SettleBatchResult } from "./gateway.js";
