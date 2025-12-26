use anchor_lang::prelude::*;
use anchor_lang::solana_program;

declare_id!("6ZuD488g1DR652G2zmBsr7emXuQXQ26ZbkFZPyRyr627");

#[program]
pub mod mtf_etf {
    use super::*;

    pub fn initialize_etf(
        ctx: Context<InitializeETF>,
        token_addresses: Vec<Pubkey>,
    ) -> Result<()> {
        let etf = &mut ctx.accounts.etf;
        etf.lister = ctx.accounts.lister.key();
        etf.token_addresses = token_addresses;
        etf.total_supply = 0;
        etf.accumulated_fees = 0;
        etf.bump = ctx.bumps.etf;
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

        let etf = &mut ctx.accounts.etf;

        // Calculate lister fee (0.5%)
        let lister_fee = sol_amount / 200;
        let sol_after_fees = sol_amount - lister_fee;

        // Transfer SOL from investor to ETF account (including fee)
        // Fee stays in contract until lister claims it
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                ctx.accounts.investor.key,
                &etf.key(),
                sol_amount,
            ),
            &[
                ctx.accounts.investor.to_account_info(),
                etf.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Update accumulated fees
        etf.accumulated_fees = etf.accumulated_fees
            .checked_add(lister_fee)
            .ok_or(ErrorCode::InvalidAmount)?;

        // Emit purchase events for each token
        // These events will be picked up by the backend to execute swaps
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

        // Calculate tokens to mint (1:1 with SOL amount)
        let tokens_to_mint = sol_amount;

        // Update ETF state
        etf.total_supply = etf.total_supply
            .checked_add(tokens_to_mint)
            .ok_or(ErrorCode::InvalidAmount)?;

        Ok(())
    }

    pub fn sell_etf(ctx: Context<SellETF>, tokens_to_sell: u64) -> Result<()> {
        require!(tokens_to_sell > 0, ErrorCode::InvalidAmount);

        let etf = &mut ctx.accounts.etf;
        require!(
            etf.total_supply >= tokens_to_sell,
            ErrorCode::InsufficientFunds
        );

        // Calculate SOL to return (1:1)
        let sol_to_return = tokens_to_sell;

        // Calculate fees
        let lister_fee = sol_to_return / 200; // 0.5%
        let sol_after_fees = sol_to_return - lister_fee;

        // Check ETF has enough lamports
        let etf_lamports = etf.to_account_info().lamports();
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(etf.to_account_info().data_len());

        require!(
            etf_lamports >= sol_after_fees + min_rent,
            ErrorCode::InsufficientFunds
        );

        // Transfer SOL back to investor (minus fee)
        **etf.to_account_info().try_borrow_mut_lamports()? -= sol_after_fees;
        **ctx.accounts.investor.to_account_info().try_borrow_mut_lamports()? += sol_after_fees;

        // Accumulate fee in contract (stays until claimed)
        etf.accumulated_fees = etf.accumulated_fees
            .checked_add(lister_fee)
            .ok_or(ErrorCode::InvalidAmount)?;

        // Update ETF state
        etf.total_supply = etf.total_supply
            .checked_sub(tokens_to_sell)
            .ok_or(ErrorCode::InvalidAmount)?;

        Ok(())
    }

    pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
        require!(
            ctx.accounts.lister.key() == ctx.accounts.etf.lister,
            ErrorCode::Unauthorized
        );

        let fees_to_claim = ctx.accounts.etf.accumulated_fees;

        require!(fees_to_claim > 0, ErrorCode::NoFeesToClaim);

        // Check contract has enough balance
        let etf_lamports = ctx.accounts.etf.to_account_info().lamports();
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(ctx.accounts.etf.to_account_info().data_len());

        require!(
            etf_lamports >= fees_to_claim + min_rent,
            ErrorCode::InsufficientFunds
        );

        // Transfer accumulated fees to lister
        **ctx.accounts.etf.to_account_info().try_borrow_mut_lamports()? -= fees_to_claim;
        **ctx.accounts.lister.to_account_info().try_borrow_mut_lamports()? += fees_to_claim;

        // Reset accumulated fees
        let etf = &mut ctx.accounts.etf;
        etf.accumulated_fees = 0;

        emit!(FeeClaimedEvent {
            etf_address: etf.key(),
            lister: ctx.accounts.lister.key(),
            amount: fees_to_claim,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn close_etf(ctx: Context<CloseETF>) -> Result<()> {
        require!(
            ctx.accounts.lister.key() == ctx.accounts.etf.lister,
            ErrorCode::Unauthorized
        );

        require!(
            ctx.accounts.etf.total_supply == 0,
            ErrorCode::CannotCloseWithSupply
        );

        // Transfer any remaining lamports (including rent) to lister
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
        space = 8 + 32 + (4 + 32 * 10) + 8 + 8 + 1,  // +8 for accumulated_fees
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
    /// CHECK: This is the lister's account for receiving fees
    #[account(mut)]
    pub lister_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SellETF<'info> {
    #[account(mut)]
    pub etf: Account<'info, ETF>,
    #[account(mut)]
    pub investor: Signer<'info>,
    /// CHECK: This is the lister's account for receiving fees
    #[account(mut)]
    pub lister_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimFees<'info> {
    #[account(mut)]
    pub etf: Account<'info, ETF>,
    #[account(mut)]
    pub lister: Signer<'info>,
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
    pub accumulated_fees: u64,  // Fees accumulated from buys/sells, claimable by lister
    pub bump: u8,
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
pub struct FeeClaimedEvent {
    pub etf_address: Pubkey,
    pub lister: Pubkey,
    pub amount: u64,
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
    #[msg("No fees available to claim")]
    NoFeesToClaim,
    #[msg("Cannot close ETF with outstanding supply")]
    CannotCloseWithSupply,
}
