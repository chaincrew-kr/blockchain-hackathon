/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Anchor.toml localnet/devnet 모두 같은 program id를 쓰므로 클러스터 전환은 RPC URL만 바꾸면 됨. */
  readonly VITE_SOLANA_RPC_URL?: string;
  /** Explorer 링크 생성용 — "localnet" | "devnet". 기본 localnet. */
  readonly VITE_SOLANA_CLUSTER?: string;
  /** 데모 상영 영화의 movieId — B/D가 init_escrow로 만든 에스크로 PDA 시드와 일치해야 함. */
  readonly VITE_MOVIE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
