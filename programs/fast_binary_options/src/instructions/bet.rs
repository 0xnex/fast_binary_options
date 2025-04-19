use crate::errors::*;
use crate::states::*;
use anchor_lang::prelude::*;
use anchor_lang::prelude::{Account, Program, Signer, System};
use anchor_lang::solana_program::ed25519_program::ID as ED25519_PROGRAM_ID;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_PROGRAM_ID,
};
use anchor_lang::system_program;

#[derive(Accounts)]
#[instruction(round_id: u64)]
/// Place a bet on the binary options market
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<UserRoundAccount>(),
        seeds = [b"user", user.key().as_ref(), round_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub user_round_account: Box<Account<'info, UserRoundAccount>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<RoundAccount>(),
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump,
      )]
    pub round_account: Box<Account<'info, RoundAccount>>,

    #[account(mut, seeds = [b"admin"], bump)]
    pub admin_account: Account<'info, AdminAccount>,

    pub system_program: Program<'info, System>,
}

impl<'info> PlaceBet<'info> {
    pub fn process(&mut self, round_id: u64, amount: u64, is_up: bool) -> Result<()> {
        let user = &mut self.user;
        let user_round_account = &mut self.user_round_account;
        let round_account = &mut self.round_account;
        let admin_account = &mut self.admin_account;

        // check if the round is started
        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp as u64;

        if current_timestamp >= round_id || round_id % 300 != 0 {
            return Err(MyErrorCode::InvalidRoundId.into());
        }

        if amount == 0 {
            return Err(MyErrorCode::ZeroAmount.into());
        }

        // Calculate fee (5% of bet amount)
        let fee = amount * 5 / 100;
        let bet_amount = amount - fee;

        // update account
        round_account.round_id = round_id;
        user_round_account.round_id = round_id;
        user_round_account.user = user.key();

        if is_up {
            round_account.up += bet_amount;
            user_round_account.up += bet_amount;
        } else {
            round_account.down += bet_amount;
            user_round_account.down += bet_amount;
        }

        // Add fee to admin account
        admin_account.fee += fee;

        // transfer the bet amount to the admin account
        system_program::transfer(
            CpiContext::new(
                self.system_program.to_account_info(),
                system_program::Transfer {
                    from: user.to_account_info(),
                    to: admin_account.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(BetPlaced {
            user: user.key(),
            round_id,
            amount,
            is_up,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct SettleRound<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, seeds = [b"round", round_id.to_le_bytes().as_ref()], bump)]
    pub round_account: Account<'info, RoundAccount>,

    /// CHECK: This is a sysvar account
    #[account(address = INSTRUCTIONS_PROGRAM_ID)]
    pub ix_account: AccountInfo<'info>,

    #[account(seeds = [b"admin"], bump)]
    pub admin_account: Account<'info, AdminAccount>,

    pub system_program: Program<'info, System>,
}

impl<'info> SettleRound<'info> {
    pub fn process(
        &mut self,
        round_id: u64,
        open_price: u64,
        close_price: u64,
        sig: [u8; 64],
    ) -> Result<()> {
        let round_account = &mut self.round_account;
        let ix_account = &mut self.ix_account;
        let admin_account = &self.admin_account;

        if round_account.open_price.is_some() {
            return Err(MyErrorCode::AlreadySettled.into());
        }

        let msg = [
            round_id.to_le_bytes(),
            open_price.to_le_bytes(),
            close_price.to_le_bytes(),
        ]
        .concat();

        msg!("msg: {:?}", msg);

        verify_ed25519_signature(
            ix_account,
            &sig,
            &msg,
            &admin_account.oracle_authority.to_bytes(),
        )?;

        round_account.open_price = Some(open_price);
        round_account.close_price = Some(close_price);

        emit!(RoundSettled {
            round_id,
            open_price,
            close_price,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct SettleBet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, close=user, seeds = [b"user", user.key().as_ref(), round_id.to_le_bytes().as_ref()], bump)]
    pub user_round_account: Account<'info, UserRoundAccount>,

    #[account(mut, seeds = [b"round", round_id.to_le_bytes().as_ref()], bump)]
    pub round_account: Account<'info, RoundAccount>,

    #[account(mut, seeds = [b"admin"], bump)]
    pub admin_account: Account<'info, AdminAccount>,

    pub system_program: Program<'info, System>,
}

impl<'info> SettleBet<'info> {
    pub fn process(&mut self, round_id: u64) -> Result<()> {
        let user = &mut self.user;
        let admin_account = &mut self.admin_account;
        let round_account = &mut self.round_account;
        let user_round_account = &mut self.user_round_account;

        if user_round_account.settled {
            return Err(MyErrorCode::AlreadySettled.into());
        }

        let is_up = round_account.open_price.unwrap() < round_account.close_price.unwrap();
        let total_bets = round_account.up + round_account.down;
        let bet_amount = if is_up {
            user_round_account.up
        } else {
            user_round_account.down
        };
        let winning_bets = if is_up {
            round_account.up
        } else {
            round_account.down
        };

        let mut reward = 0;
        if bet_amount > 0 && winning_bets > 0 {
            // Calculate reward using the new formula:
            // user's winning bet * total bets / total winning bets
            reward = (bet_amount as u128)
                .checked_mul(total_bets as u128)
                .ok_or(MyErrorCode::Overflow)?
                .checked_div(winning_bets as u128)
                .ok_or(MyErrorCode::Overflow)? as u64;

            // Transfer reward to user
            **user.to_account_info().try_borrow_mut_lamports()? += reward;
            **admin_account.to_account_info().try_borrow_mut_lamports()? -= reward;
        }

        user_round_account.settled = true;

        emit!(BetSettled {
            user: user.key(),
            round_id,
            amount: bet_amount,
            is_up,
            reward,
        });
        Ok(())
    }
}

fn verify_ed25519_signature(
    ix_account: &AccountInfo,
    signature: &[u8],
    message: &[u8],
    public_key: &[u8],
) -> Result<()> {
    let current_index = load_current_index_checked(ix_account)?;

    if current_index == 0 {
        return Err(MyErrorCode::InvalidInstruction.into());
    }

    let ed25519_ix = load_instruction_at_checked(0, ix_account)?;

    if ed25519_ix.program_id != ED25519_PROGRAM_ID {
        return Err(MyErrorCode::InvalidInstruction.into());
    }

    let data = ed25519_ix.data;

    if data.len() < 2 {
        return Err(MyErrorCode::InvalidSignature.into());
    }

    let num_signatures = data[0];
    if num_signatures != 1 {
        return Err(MyErrorCode::InvalidSignature.into());
    }

    let offsets: Ed25519SignatureOffsets = Ed25519SignatureOffsets::try_from_slice(&data[2..16])?;

    let sig_start = offsets.signature_offset as usize;
    let sig_end = sig_start + 64;
    let sig = &data[sig_start..sig_end];

    if sig != signature {
        return Err(MyErrorCode::SignatureVerificationFailed.into());
    }

    let msg_start = offsets.message_data_offset as usize;
    let msg_end = msg_start + offsets.message_data_size as usize;
    let msg = &data[msg_start..msg_end];

    if msg != message {
        return Err(MyErrorCode::MessageVerificationFailed.into());
    }

    let pk_start = offsets.public_key_offset as usize;
    let pk_end = pk_start + 32;
    let pk = &data[pk_start..pk_end];

    if pk != public_key {
        return Err(MyErrorCode::PubkeyVerificationFailed.into());
    }

    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct Ed25519SignatureOffsets {
    signature_offset: u16,
    signature_instruction_index: u16,
    public_key_offset: u16,
    public_key_instruction_index: u16,
    message_data_offset: u16,
    message_data_size: u16,
    message_instruction_index: u16,
}

#[event]
pub struct BetPlaced {
    pub user: Pubkey,
    pub round_id: u64,
    pub amount: u64,
    pub is_up: bool,
}

#[event]
pub struct RoundSettled {
    pub round_id: u64,
    pub open_price: u64,
    pub close_price: u64,
}

#[event]
pub struct BetSettled {
    pub user: Pubkey,
    pub round_id: u64,
    pub amount: u64,
    pub is_up: bool,
    pub reward: u64,
}



