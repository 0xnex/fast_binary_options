use anchor_lang::prelude::*;
mod errors;
pub mod instructions;
pub mod states;

use instructions::admin::*;
use instructions::bet::*;

declare_id!("GEUJ7QRkLE8vdkm2pF4pgqp5SuGeqWe3RrCCRtW68gtK");

#[program]
pub mod fast_binary_option {
    use super::*;

    pub fn initialize_admin(ctx: Context<InitializeAdmin>, oracle_authority: Pubkey) -> Result<()> {
        ctx.accounts.process(oracle_authority)
    }

    pub fn set_oracle_authority(
        ctx: Context<SetOracleAuthority>,
        oracle_authority: Pubkey,
    ) -> Result<()> {
        ctx.accounts.process(oracle_authority)
    }

    pub fn set_admin_authority(ctx: Context<SetAdminAuthority>, authority: Pubkey) -> Result<()> {
        ctx.accounts.process(authority)
    }

    pub fn withdraw_fee(ctx: Context<WithdrawFee>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn delete_admin(ctx: Context<DeleteAdmin>) -> Result<()> {
        ctx.accounts.process()
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        round_id: u64,
        amount: u64,
        is_up: bool,
    ) -> Result<()> {
        ctx.accounts.process(round_id, amount, is_up)
    }

    pub fn settle_bet(ctx: Context<SettleBet>, round_id: u64) -> Result<()> {
        ctx.accounts.process(round_id)
    }

    pub fn settle_round(
        ctx: Context<SettleRound>,
        round_id: u64,
        start_price: u64,
        end_price: u64,
        sig: [u8; 64],
    ) -> Result<()> {
        ctx.accounts.process(round_id, start_price, end_price, sig)
    }
}
