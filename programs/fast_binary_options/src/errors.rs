use anchor_lang::prelude::*;

#[error_code]
pub enum MyErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("User account has bets")]
    UserAccountHasBets,
    #[msg("Transfer failed")]
    TransferFailed,
    #[msg("Zero amount")]
    ZeroAmount,
    #[msg("Invalid signature")]
    InvalidSignature,
    #[msg("Already settled")]
    AlreadySettled,
    #[msg("Round not settled")]
    RoundNotSettled,
    #[msg("Round started")]
    RoundStarted,
    #[msg("Invalid instruction")]
    InvalidInstruction,
    #[msg("signature verification failed")]
    SignatureVerificationFailed,
    #[msg("message verification failed")]
    MessageVerificationFailed,
    #[msg("Pubkey verification failed")]
    PubkeyVerificationFailed,
    #[msg("No fee to withdraw")]
    NoFeeToWithdraw,
    #[msg("Calculation overflow")]
    Overflow,
}
