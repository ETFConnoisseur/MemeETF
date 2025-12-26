use anchor_lang::prelude::*;
use anchor_lang::solana_program;

declare_id!("CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo");

// Hardcoded dev wallet - receives 0.5% fee on all buys/sells
pub const DEV_WALLET: Pubkey = solana_program::pubkey!("GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx");

#[program]
pub mod mtf_etf {
    use super::*;

    pub fn initialize_etf(
        ctx: Context<InitializeETF>,
        token_addresses: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            token_addresses.len() > 0 && token_addresses.len() <= 10,
            ErrorCode::InvalidTokenCount
        );

        let etf = &mut ctx.accounts.etf;
        etf.lister = ctx.accounts.lister.key();
        etf.token_addresses = token_addresses;
        etf.total_supply = 0;
        etf.accumulated_fees = 0;
        etf.bump = ctx.bumps.etf;

        emit!(ETFCreatedEvent {
            etf_address: etf.key(),
            lister: ctx.accounts.lister.key(),
            token_count: etf.token_addresses.len() as u8,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn buy_etf(
        ctx: Context<BuyETF>,
        sol_amount: u64,
        token_percentages: Vec<u8>,
    ) -> Result<()> {
        require!(sol_amount > 0, ErrorCode::InvalidAmount);
        require!(
            token_percentages.len() == ctx.accounts.etf.token_addresses.len(),
            ErrorCode::InvalidTokenPercentages
        );

        // Verify percentages sum to 100
        let total_percentage: u16 = token_percentages.iter().map(|&p| p as u16).sum();
        require!(total_percentage == 100, ErrorCode::InvalidTokenPercentages);

        // Verify dev wallet is correct
        require!(
            ctx.accounts.dev_wallet.key() == DEV_WALLET,
            ErrorCode::InvalidDevWallet
        );

        // Verify lister account matches ETF lister
        require!(
            ctx.accounts.lister_account.key() == ctx.accounts.etf.lister,
            ErrorCode::InvalidListerAccount
        );

        let etf = &mut ctx.accounts.etf;

        // Calculate fees: 0.5% to creator, 0.5% to dev = 1% total
        let creator_fee = sol_amount / 200; // 0.5%
        let dev_fee = sol_amount / 200;     // 0.5%
        let total_fees = creator_fee + dev_fee;
        let sol_after_fees = sol_amount - total_fees;

        // Transfer SOL from investor to ETF account (for swaps)
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                ctx.accounts.investor.key,
                &etf.key(),
                sol_after_fees,
            ),
            &[
                ctx.accounts.investor.to_account_info(),
                etf.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer creator fee directly to lister
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                ctx.accounts.investor.key,
                ctx.accounts.lister_account.key,
                creator_fee,
            ),
            &[
                ctx.accounts.investor.to_account_info(),
                ctx.accounts.lister_account.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer dev fee directly to dev wallet
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                ctx.accounts.investor.key,
                ctx.accounts.dev_wallet.key,
                dev_fee,
            ),
            &[
                ctx.accounts.investor.to_account_info(),
                ctx.accounts.dev_wallet.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Emit fee events for transparency
        emit!(FeeTransferEvent {
            etf_address: etf.key(),
            recipient: ctx.accounts.lister_account.key(),
            amount: creator_fee,
            fee_type: FeeType::Creator,
            timestamp: Clock::get()?.unix_timestamp,
        });

        emit!(FeeTransferEvent {
            etf_address: etf.key(),
            recipient: ctx.accounts.dev_wallet.key(),
            amount: dev_fee,
            fee_type: FeeType::Dev,
            timestamp: Clock::get()?.unix_timestamp,
        });

        // Emit purchase events for each token (for backend to execute swaps)
        for (token_address, percentage) in etf.token_addresses.iter()
            .zip(token_percentages.iter())
        {
            let sol_for_token = (sol_after_fees as u128 * (*percentage as u128) / 100) as u64;

            emit!(TokenPurchaseEvent {
                etf_address: etf.key(),
                investor: ctx.accounts.investor.key(),
                token_address: *token_address,
                sol_amount: sol_for_token,
                percentage: *percentage,
                timestamp: Clock::get()?.unix_timestamp,
            });
        }

        // Update ETF state - mint 1:1 with SOL invested (after fees)
        let tokens_to_mint = sol_after_fees;
        etf.total_supply = etf.total_supply
            .checked_add(tokens_to_mint)
            .ok_or(ErrorCode::InvalidAmount)?;

        Ok(())
    }

    pub fn sell_etf(ctx: Context<SellETF>, tokens_to_sell: u64) -> Result<()> {
        require!(tokens_to_sell > 0, ErrorCode::InvalidAmount);

        // Verify dev wallet is correct
        require!(
            ctx.accounts.dev_wallet.key() == DEV_WALLET,
            ErrorCode::InvalidDevWallet
        );

        // Verify lister account matches ETF lister
        require!(
            ctx.accounts.lister_account.key() == ctx.accounts.etf.lister,
            ErrorCode::InvalidListerAccount
        );

        let etf = &mut ctx.accounts.etf;
        require!(
            etf.total_supply >= tokens_to_sell,
            ErrorCode::InsufficientFunds
        );

        // Calculate SOL to return (1:1)
        let sol_to_return = tokens_to_sell;

        // Calculate fees: 0.5% to creator, 0.5% to dev = 1% total
        let creator_fee = sol_to_return / 200; // 0.5%
        let dev_fee = sol_to_return / 200;     // 0.5%
        let total_fees = creator_fee + dev_fee;
        let sol_after_fees = sol_to_return - total_fees;

        // Check ETF has enough lamports
        let etf_lamports = etf.to_account_info().lamports();
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(etf.to_account_info().data_len());

        require!(
            etf_lamports >= sol_to_return + min_rent,
            ErrorCode::InsufficientFunds
        );

        // Transfer SOL back to investor (minus fees)
        **etf.to_account_info().try_borrow_mut_lamports()? -= sol_to_return;
        **ctx.accounts.investor.to_account_info().try_borrow_mut_lamports()? += sol_after_fees;

        // Transfer creator fee
        **ctx.accounts.lister_account.to_account_info().try_borrow_mut_lamports()? += creator_fee;

        // Transfer dev fee
        **ctx.accounts.dev_wallet.to_account_info().try_borrow_mut_lamports()? += dev_fee;

        // Emit fee events
        emit!(FeeTransferEvent {
            etf_address: etf.key(),
            recipient: ctx.accounts.lister_account.key(),
            amount: creator_fee,
            fee_type: FeeType::Creator,
            timestamp: Clock::get()?.unix_timestamp,
        });

        emit!(FeeTransferEvent {
            etf_address: etf.key(),
            recipient: ctx.accounts.dev_wallet.key(),
            amount: dev_fee,
            fee_type: FeeType::Dev,
            timestamp: Clock::get()?.unix_timestamp,
        });

        // Update ETF state
        etf.total_supply = etf.total_supply
            .checked_sub(tokens_to_sell)
            .ok_or(ErrorCode::InvalidAmount)?;

        Ok(())
    }

    // Remove claim_fees - fees are now sent automatically
    // Keeping close_etf for cleanup

    pub fn close_etf(ctx: Context<CloseETF>) -> Result<()> {
        require!(
            ctx.accounts.lister.key() == ctx.accounts.etf.lister,
            ErrorCode::Unauthorized
        );

        require!(
            ctx.accounts.etf.total_supply == 0,
            ErrorCode::CannotCloseWithSupply
        );

        // Transfer any remaining lamports (rent) to lister
        let etf_lamports = ctx.accounts.etf.to_account_info().lamports();
        **ctx.accounts.etf.to_account_info().try_borrow_mut_lamports()? = 0;
        **ctx.accounts.lister.to_account_info().try_borrow_mut_lamports()? += etf_lamports;

        emit!(ETFClosedEvent {
            etf_address: ctx.accounts.etf.key(),
            lister: ctx.accounts.lister.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeETF<'info> {
    #[account(
        init,
        payer = lister,
        space = 8 + 32 + (4 + 32 * 10) + 8 + 8 + 1,
        seeds = [b"etf", lister.key().as_ref()],
        bump
    )]
    pub etf: Account<'info, ETF>,
    #[account(mut)]
    pub lister: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyETF<'info> {
    #[account(mut)]
    pub etf: Account<'info, ETF>,
    #[account(mut)]
    pub investor: Signer<'info>,
    /// CHECK: This is the lister's account - validated against etf.lister
    #[account(mut)]
    pub lister_account: AccountInfo<'info>,
    /// CHECK: This is the dev wallet - validated against DEV_WALLET constant
    #[account(mut)]
    pub dev_wallet: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SellETF<'info> {
    #[account(mut)]
    pub etf: Account<'info, ETF>,
    #[account(mut)]
    pub investor: Signer<'info>,
    /// CHECK: This is the lister's account - validated against etf.lister
    #[account(mut)]
    pub lister_account: AccountInfo<'info>,
    /// CHECK: This is the dev wallet - validated against DEV_WALLET constant
    #[account(mut)]
    pub dev_wallet: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseETF<'info> {
    #[account(
        mut,
        close = lister,
        has_one = lister,
    )]
    pub etf: Account<'info, ETF>,
    #[account(mut)]
    pub lister: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct ETF {
    pub lister: Pubkey,
    pub token_addresses: Vec<Pubkey>,
    pub total_supply: u64,
    pub accumulated_fees: u64,  // Kept for backwards compatibility, now always 0
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum FeeType {
    Creator,
    Dev,
}

#[event]
pub struct ETFCreatedEvent {
    pub etf_address: Pubkey,
    pub lister: Pubkey,
    pub token_count: u8,
    pub timestamp: i64,
}

#[event]
pub struct TokenPurchaseEvent {
    pub etf_address: Pubkey,
    pub investor: Pubkey,
    pub token_address: Pubkey,
    pub sol_amount: u64,
    pub percentage: u8,
    pub timestamp: i64,
}

#[event]
pub struct FeeTransferEvent {
    pub etf_address: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub fee_type: FeeType,
    pub timestamp: i64,
}

#[event]
pub struct ETFClosedEvent {
    pub etf_address: Pubkey,
    pub lister: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds for this operation")]
    InsufficientFunds,
    #[msg("Invalid amount specified")]
    InvalidAmount,
    #[msg("You are not authorized to perform this action")]
    Unauthorized,
    #[msg("Invalid token percentages - must sum to 100")]
    InvalidTokenPercentages,
    #[msg("Cannot close ETF with outstanding supply")]
    CannotCloseWithSupply,
    #[msg("Invalid token count - must be between 1 and 10")]
    InvalidTokenCount,
    #[msg("Invalid dev wallet address")]
    InvalidDevWallet,
    #[msg("Invalid lister account - must match ETF creator")]
    InvalidListerAccount,
}
