use anchor_lang::prelude::*;
mod errors;
pub mod instructions;
pub mod states;

use instructions::admin::*;

declare_id!("HBhpjrgaPv98PLxjEbajwst19K3WHUBdAEW9RpEjvNee");

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
}
