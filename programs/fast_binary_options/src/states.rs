use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct UserRoundAccount {
    pub user: Pubkey,
    pub round_id: u64,
    pub up: u64,   // amount of bet up
    pub down: u64, // amount of bet down
    pub settled: bool,
}

#[account]
#[derive(InitSpace)]
pub struct RoundAccount {
    pub round_id: u64,
    pub up: u64,
    pub down: u64,
    pub start_price: Option<u64>,
    pub end_price: Option<u64>,
}

#[account]
#[derive(InitSpace)]
pub struct AdminAccount {
    pub authority: Pubkey,
    pub oracle_authority: Pubkey,
    pub fee: u64,
}
