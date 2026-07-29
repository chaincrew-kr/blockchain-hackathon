### Technical Overview

#### 1. Problem
In `packages/schema/src/index.ts`, the TypeScript schema defines `EscrowStatus` as:
```ts
/** 에스크로 상태머신 — Anchor state와 명칭 일치 필수 (B·C 합의) */
export type EscrowStatus =
  "pending" | "verified" | "allocated" | "paid" | "disputed";
```
However, the corresponding Solana Anchor program account struct `MovieEscrow` in `programs/movie_escrow/src/state.rs` was missing both the `status` field and the `EscrowStatus` enum definition. This causes a schema mismatch between the on-chain Anchor IDL/state and the off-chain TypeScript SDK/schema.

#### 2. Resolution Strategy
1. **Define `EscrowStatus` Enum**: Add `EscrowStatus` enum to `programs/movie_escrow/src/state.rs` with Anchor serialization traits (`AnchorSerialize`, `AnchorDeserialize`), spatial calculation (`InitSpace`), and standard Rust derives (`Clone`, `Copy`, `PartialEq`, `Eq`, `Debug`, `Default`).
2. **Add `status` Field**: Include `pub status: EscrowStatus` in the `MovieEscrow` account struct.
3. **Variant Alignment**: Map TS variants (`pending`, `verified`, `allocated`, `paid`, `disputed`) to Rust PascalCase variants (`Pending`, `Verified`, `Allocated`, `Paid`, `Disputed`), which Anchor automatically serializes/deserializes to lowerCamelCase string unions in TypeScript.

---

### Code Changes

#### `programs/movie_escrow/src/state.rs`

```rust
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug, Default)]
pub enum EscrowStatus {
    #[default]
    Pending,
    Verified,
    Allocated,
    Paid,
    Disputed,
}

#[account]
#[derive(InitSpace)]
pub struct MovieEscrow {
    pub initializer: Pubkey,
    pub movie_id: u64,
    pub amount: u64,
    pub status: EscrowStatus,
    pub bump: u8,
}
```

---

### Patch / Git Diff

```diff
--- a/programs/movie_escrow/src/state.rs
+++ b/programs/movie_escrow/src/state.rs
@@ -1,6 +1,17 @@
 use anchor_lang::prelude::*;

+#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug, Default)]
+pub enum EscrowStatus {
+    #[default]
+    Pending,
+    Verified,
+    Allocated,
+    Paid,
+    Disputed,
+}
+
 #[account]
 #[derive(InitSpace)]
 pub struct MovieEscrow {
     pub initializer: Pubkey,
     pub movie_id: u64,
     pub amount: u64,
+    pub status: EscrowStatus,
     pub bump: u8,
 }
```

### Initialization Instruction Update (Example)
When initializing `MovieEscrow` (e.g. in `instructions/initialize.rs` or `lib.rs`):

```rust
pub fn initialize(ctx: Context<Initialize>, movie_id: u64, amount: u64) -> Result<()> {
    let escrow = &mut ctx.accounts.movie_escrow;
    escrow.initializer = ctx.accounts.initializer.key();
    escrow.movie_id = movie_id;
    escrow.amount = amount;
    escrow.status = EscrowStatus::Pending;
    escrow.bump = ctx.bumps.movie_escrow;
    Ok(())
}
```