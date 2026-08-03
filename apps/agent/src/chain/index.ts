/**
 * 체인 게이트웨이 선택 — 환경변수가 갖춰지면 실제 온체인, 아니면 스텁.
 *
 * 스텁으로 떨어지는 것 자체는 정상 동작이다(체인 미연결 상태에서도 STAGE 3·4를
 * 개발·시연해야 한다). 다만 **스텁일 때는 트랜잭션이 가짜라는 사실이 로그와
 * `/health`에 드러나야 한다** — 이슈 #18. 진척도를 실제보다 높게 보이게 하는
 * 것이 가장 위험하다.
 */
import { logger } from "../logger.js";
import type { HistoryProvider } from "../risk-check/history.js";
import { AnchorChainGateway } from "./anchor-gateway.js";
import { StubChainGateway, type ChainGateway } from "./gateway.js";

export type ChainMode = "stub" | "anchor";

export interface ChainSetup {
  gateway: ChainGateway;
  mode: ChainMode;
  /** anchor 모드일 때 서명 지갑 공개키 */
  authority?: string;
  /** anchor 모드일 때 온체인 상영관 공개키 */
  theater?: string;
  historyProvider?: HistoryProvider;
  movieId?: string;
}

/** anchor 모드에 필요한 환경변수 — 하나라도 비면 스텁으로 떨어진다. */
const REQUIRED = [
  "SOLANA_RPC_URL",
  "SOLANA_PROGRAM_ID",
  "AGENT_KEYPAIR_PATH",
  "SOLANA_IDL_PATH",
  "ESCROW_MOVIE_ID",
  "THEATER_WALLET",
  "DISTRIBUTOR_WALLET",
  "PRODUCER_WALLET",
  "INVESTOR_WALLET",
  "THEATER_BPS",
  "DISTRIBUTOR_BPS",
  "DISTRIBUTION_FEE_BPS",
  "INVESTOR_PROFIT_BPS",
] as const;

function integer(
  env: NodeJS.ProcessEnv,
  key: (typeof REQUIRED)[number],
): number {
  const value = Number(env[key]);
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
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
      idlPath: env.SOLANA_IDL_PATH as string,
      movieId: env.ESCROW_MOVIE_ID as string,
      theaterWallet: env.THEATER_WALLET as string,
      distributorWallet: env.DISTRIBUTOR_WALLET as string,
      producerWallet: env.PRODUCER_WALLET as string,
      investorWallet: env.INVESTOR_WALLET as string,
      theaterBps: integer(env, "THEATER_BPS"),
      distributorBps: integer(env, "DISTRIBUTOR_BPS"),
      distributionFeeBps: integer(env, "DISTRIBUTION_FEE_BPS"),
      investorProfitBps: integer(env, "INVESTOR_PROFIT_BPS"),
    });
    return {
      gateway,
      mode: "anchor",
      authority: gateway.authority,
      theater: gateway.theater,
      historyProvider: gateway.historyProvider,
      movieId: env.ESCROW_MOVIE_ID as string,
    };
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
