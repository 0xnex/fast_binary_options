use crate::errors::MyErrorCode;
use crate::states::AdminAccount;
use anchor_lang::prelude::*;
use anchor_lang::system_program;

#[derive(Accounts)]
pub struct InitializeAdmin<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(init, payer = user, space = 8 + std::mem::size_of::<AdminAccount>(), seeds = [b"admin"], bump)]
    pub admin_account: Box<Account<'info, AdminAccount>>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializeAdmin<'info> {
    pub fn process(&mut self, oracle_authority: Pubkey) -> Result<()> {
        let admin_account = &mut self.admin_account;
        admin_account.authority = *self.user.key;
        admin_account.oracle_authority = oracle_authority;
        admin_account.fee = 0;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct DeleteAdmin<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority, close = authority)]
    pub admin_account: Box<Account<'info, AdminAccount>>,
}

impl<'info> DeleteAdmin<'info> {
    pub fn process(&mut self) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct SetOracleAuthority<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub admin_account: Box<Account<'info, AdminAccount>>,
}

impl<'info> SetOracleAuthority<'info> {
    pub fn process(&mut self, oracle_authority: Pubkey) -> Result<()> {
        let admin_account = &mut self.admin_account;

        admin_account.oracle_authority = oracle_authority;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct SetAdminAuthority<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub admin_account: Box<Account<'info, AdminAccount>>,
}

impl<'info> SetAdminAuthority<'info> {
    pub fn process(&mut self, new_authority: Pubkey) -> Result<()> {
        let admin_account = &mut self.admin_account;
        admin_account.authority = new_authority;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct WithdrawFee<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority, seeds = [b"admin"], bump)]
    pub admin_account: Box<Account<'info, AdminAccount>>,

    /// CHECK: safe
    #[account(mut)]
    pub to: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> WithdrawFee<'info> {
    pub fn process(&mut self) -> Result<()> {
        let admin_account = &mut self.admin_account;
        let to = &mut self.to;
        let fee = admin_account.fee;

        if fee == 0 {
            return Err(MyErrorCode::ZeroAmount.into());
        }
        // Transfer fee to admin
        **to.try_borrow_mut_lamports()? += fee;
        **admin_account.to_account_info().try_borrow_mut_lamports()? -= fee;

        // Reset fee to zero
        admin_account.fee = 0;

        Ok(())
    }
}
