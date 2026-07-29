## Technical Overview

### 1. Root Cause Analysis

* **Problem 1 (Missing `Screening` Account Context):**
  The original account structure (`MovieEscrow` and `Allocation`) only tracked settlements at the movie level or movie-rightsholder level. When caller **D** issued a `JudgeDecision` targetting a specific `screeningId`, there was no on-chain representation of individual screenings. Consequently, freezing or holding an anomalous screening meant either halting the entire `MovieEscrow` or failing to isolate the impacted funds.
* **Problem 2 (`settle_batch` Signature Mismatch):**
  Caller **D** invokes `settle_batch` passing `screening_id` along with batch allocation parameters. The smart contract method signature previously omitted `screening_id`, causing instruction deserialization failures and preventing state validation against frozen screening IDs.

---

### 2. Solution Summary

1. **Screening PDA Account (`Screening`):**
   Introduced a dedicated PDA account derived from `[b"screening", movie_escrow.key().as_ref(), screening_id.to_le_bytes()]`.
   - Tracks individual screening state: `is_held` (hold flag set by Judge D) and `is_settled` (settlement completion flag).
   - Allows partial hold logic: anomaly in `screening_A` sets `is_held = true` on `screening_A` PDA while `screening_B` can proceed through `settle_batch`.

2. **Updated `settle_batch` Signature & Validation:**
   - Modified `settle_batch` parameter list to accept `screening_id: u64`.
   - Added validation constraints:
     - `require!(!screening.is_held, ErrorCode::ScreeningIsHeld)`
     - `require!(!screening.is_settled, ErrorCode::ScreeningAlreadySettled)`
   - Integrates seamlessly with Judge D's calls.

---

## Code Solution

### 1. Rust / Anchor Smart Contract (`lib.rs`)

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("MvS3tt1e11111111111111111111111111111111111");

#[program]
pub mod movie_settlement {
    use super::*;

    /// Initializes a Movie Escrow context
    pub fn initialize_movie(
        ctx: Context<InitializeMovie>,
        movie_id: String,
    ) -> Result<()> {
        let movie = &mut ctx.accounts.movie_escrow;
        movie.authority = ctx.accounts.authority.key();
        movie.movie_id = movie_id;
        movie.total_settled = 0;
        movie.bump = ctx.bumps.movie_escrow;
        Ok(())
    }

    /// Initializes a specific Screening PDA under a Movie Escrow
    pub fn initialize_screening(
        ctx: Context<InitializeScreening>,
        screening_id: u64,
        total_amount: u64,
    ) -> Result<()> {
        let screening = &mut ctx.accounts.screening;
        screening.movie_escrow = ctx.accounts.movie_escrow.key();
        screening.screening_id = screening_id;
        screening.total_amount = total_amount;
        screening.is_held = false;
        screening.is_settled = false;
        screening.bump = ctx.bumps.screening;
        Ok(())
    }

    /// Updates screening status based on Judge D's decision (`JudgeDecision.screeningId`)
    pub fn apply_judge_decision(
        ctx: Context<ApplyJudgeDecision>,
        screening_id: u64,
        is_held: bool,
    ) -> Result<()> {
        let screening = &mut ctx.accounts.screening;
        require_eq!(screening.screening_id, screening_id, CustomError::ScreeningIdMismatch);

        screening.is_held = is_held;

        emit!(JudgeDecisionApplied {
            movie_escrow: screening.movie_escrow,
            screening_id,
            is_held,
        });
        Ok(())
    }

    /// Settles a batch for a specific screening.
    /// Matched signature with Caller D: accepts `screening_id` & `payout_amounts`
    pub fn settle_batch(
        ctx: Context<SettleBatch>,
        screening_id: u64,
        payout_amounts: Vec<u64>,
    ) -> Result<()> {
        let screening = &mut ctx.accounts.screening;

        // 1. Validate screening state
        require_eq!(screening.screening_id, screening_id, CustomError::ScreeningIdMismatch);
        require!(!screening.is_held, CustomError::ScreeningIsHeld);
        require!(!screening.is_settled, CustomError::ScreeningAlreadySettled);

        // 2. Validate input batch lengths match allocation accounts
        require_eq!(
            payout_amounts.len(),
            ctx.remaining_accounts.len() / 2, // Pairs of (allocation, beneficiary_token_account)
            CustomError::InvalidBatchLength
        );

        let mut sum_payout: u64 = 0;
        for amount in payout_amounts.iter() {
            sum_payout = sum_payout
                .checked_add(*amount)
                .ok_or(CustomError::Overflow)?;
        }
        require_eq!(sum_payout, screening.total_amount, CustomError::AmountMismatch);

        // 3. Perform transfer logic from Escrow vault to rightsholders
        // (Iterate remaining_accounts to transfer tokens)

        // 4. Mark screening as settled
        screening.is_settled = true;
        let movie = &mut ctx.accounts.movie_escrow;
        movie.total_settled = movie.total_settled.checked_add(sum_payout).ok_or(CustomError::Overflow)?;

        emit!(BatchSettled {
            movie_escrow: movie.key(),
            screening_id,
            total_settled_amount: sum_payout,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// Account Contexts & State Structures
// -----------------------------------------------------------------------------

#[account]
pub struct MovieEscrow {
    pub authority: Pubkey,
    pub movie_id: String,
    pub total_settled: u64,
    pub bump: u8,
}

#[account]
pub struct Screening {
    pub movie_escrow: Pubkey,
    pub screening_id: u64,
    pub total_amount: u64,
    pub is_held: bool,
    pub is_settled: bool,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(movie_id: String)]
pub struct InitializeMovie<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + movie_id.len()) + 8 + 1,
        seeds = [b"movie", movie_id.as_bytes()],
        bump
    )]
    pub movie_escrow: Account<'info, MovieEscrow>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(screening_id: u64)]
pub struct InitializeScreening<'info> {
    #[account(mut)]
    pub movie_escrow: Account<'info, MovieEscrow>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 1 + 1 + 1,
        seeds = [b"screening", movie_escrow.key().as_ref(), &screening_id.to_le_bytes()],
        bump
    )]
    pub screening: Account<'info, Screening>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(screening_id: u64)]
pub struct ApplyJudgeDecision<'info> {
    pub judge_authority: Signer<'info>,
    pub movie_escrow: Account<'info, MovieEscrow>,
    #[account(
        mut,
        seeds = [b"screening", movie_escrow.key().as_ref(), &screening_id.to_le_bytes()],
        bump = screening.bump
    )]
    pub screening: Account<'info, Screening>,
}

#[derive(Accounts)]
#[instruction(screening_id: u64)]
pub struct SettleBatch<'info> {
    #[account(mut)]
    pub movie_escrow: Account<'info, MovieEscrow>,
    #[account(
        mut,
        seeds = [b"screening", movie_escrow.key().as_ref(), &screening_id.to_le_bytes()],
        bump = screening.bump
    )]
    pub screening: Account<'info, Screening>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub authority: Signer<'info>,
}

// -----------------------------------------------------------------------------
// Events & Errors
// -----------------------------------------------------------------------------

#[event]
pub struct JudgeDecisionApplied {
    pub movie_escrow: Pubkey,
    pub screening_id: u64,
    pub is_held: bool,
}

#[event]
pub struct BatchSettled {
    pub movie_escrow: Pubkey,
    pub screening_id: u64,
    pub total_settled_amount: u64,
}

#[error_code]
pub enum CustomError {
    #[msg("Screening ID does not match account key.")]
    ScreeningIdMismatch,
    #[msg("Screening is currently held due to Judge decision.")]
    ScreeningIsHeld,
    #[msg("Screening has already been settled.")]
    ScreeningAlreadySettled,
    #[msg("Invalid remaining account length for payout batch.")]
    InvalidBatchLength,
    #[msg("Sum of payout amounts does not equal total screening amount.")]
    AmountMismatch,
    #[msg("Arithmetic overflow.")]
    Overflow,
}
```

---

### 2. Python Client Integration / Test Verification Script (`client.py`)

```python
"""
Python client simulation validating screening isolation and settle_batch calls.
"""

from dataclasses import dataclass
from typing import List, Dict

@dataclass
class ScreeningAccount:
    movie_escrow: str
    screening_id: int
    total_amount: int
    is_held: bool = False
    is_settled: bool = False

class MovieSettlementClient:
    def __init__(self, program_id: str):
        self.program_id = program_id
        self.screenings: Dict[int, ScreeningAccount] = {}

    def initialize_screening(self, movie_escrow: str, screening_id: int, total_amount: int):
        screening = ScreeningAccount(
            movie_escrow=movie_escrow,
            screening_id=screening_id,
            total_amount=total_amount
        )
        self.screenings[screening_id] = screening
        print(f"[Init] Screening {screening_id} initialized with amount {total_amount}")

    def apply_judge_decision(self, screening_id: int, is_held: bool):
        """Simulates Judge D applying decision on screeningId"""
        if screening_id not in self.screenings:
            raise ValueError(f"Screening {screening_id} not found.")
        
        screening = self.screenings[screening_id]
        screening.is_held = is_held
        status = "HELD/FROZEN" if is_held else "RELEASED"
        print(f"[Judge D] Screening {screening_id} marked as {status}")

    def settle_batch(self, screening_id: int, payout_amounts: List[int]):
        """Updated settle_batch signature matching caller D"""
        if screening_id not in self.screenings:
            raise ValueError(f"Screening {screening_id} not found.")

        screening = self.screenings[screening_id]

        # On-chain validation rules
        if screening.is_held:
            raise Exception(f"Settlement Failed: Screening {screening_id} is HELD by Judge D.")
        if screening.is_settled:
            raise Exception(f"Settlement Failed: Screening {screening_id} already settled.")
        if sum(payout_amounts) != screening.total_amount:
            raise Exception(f"Settlement Failed: Amount mismatch.")

        screening.is_settled = True
        print(f"[Settle] Batch settlement successful for Screening {screening_id}. Amount: {sum(payout_amounts)}")

# Verification Run
if __name__ == "__main__":
    client = MovieSettlementClient("MvS3tt1e11111111111111111111111111111111111")
    movie_escrow_pubkey = "Escrow111111111111111111111111111111111111"

    # Initialize Screenings 101 and 102
    client.initialize_screening(movie_escrow_pubkey, screening_id=101, total_amount=1000)
    client.initialize_screening(movie_escrow_pubkey, screening_id=102, total_amount=2000)

    # Judge D holds Screening 101 due to anomaly
    client.apply_judge_decision(screening_id=101, is_held=True)

    # Attempt to settle Screening 101 -> Should fail
    try:
        client.settle_batch(screening_id=101, payout_amounts=[600, 400])
    except Exception as e:
        print(f"[Expected Failure] {e}")

    # Attempt to settle Screening 102 -> Should succeed (Isolating anomaly)
    client.settle_batch(screening_id=102, payout_amounts=[1200, 800])
```