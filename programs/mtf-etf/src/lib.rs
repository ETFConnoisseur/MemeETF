use anchor_lang::prelude::*;

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
        etf.bump = ctx.bumps.etf;
        Ok(())
    }

    pub fn buy_etf(ctx: Context<BuyETF>, sol_amount: u64) -> Result<()> {
        require!(sol_amount > 0, ErrorCode::InvalidAmount);
        
        let etf = &mut ctx.accounts.etf;
        
        // Calculate tokens to mint (1:1 for simplicity)
        let tokens_to_mint = sol_amount;
        
        // Transfer SOL from investor to ETF account (adds to lamports)
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
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
        
        // Update ETF state
        etf.total_supply = etf.total_supply
            .checked_add(tokens_to_mint)
            .ok_or(ErrorCode::InvalidAmount)?;
        
        // Calculate fees (1% total, 0.5% to lister)
        let lister_fee = sol_amount / 200; // 0.5%
        
        // Transfer fee to lister using direct lamport manipulation (works for PDAs with data)
        if lister_fee > 0 {
            **etf.to_account_info().try_borrow_mut_lamports()? -= lister_fee;
            **ctx.accounts.lister_account.to_account_info().try_borrow_mut_lamports()? += lister_fee;
        }
        
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
        
        // Transfer SOL back to investor using direct lamport manipulation
        **etf.to_account_info().try_borrow_mut_lamports()? -= sol_after_fees;
        **ctx.accounts.investor.to_account_info().try_borrow_mut_lamports()? += sol_after_fees;
        
        // Transfer fee to lister
        if lister_fee > 0 {
            **etf.to_account_info().try_borrow_mut_lamports()? -= lister_fee;
            **ctx.accounts.lister_account.to_account_info().try_borrow_mut_lamports()? += lister_fee;
        }
        
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
        
        let etf = &ctx.accounts.etf;
        let etf_lamports = etf.to_account_info().lamports();
        let rent = Rent::get()?;
        let min_rent = rent.minimum_balance(etf.to_account_info().data_len());
        
        if etf_lamports > min_rent {
            let transfer_amount = etf_lamports - min_rent;
            
            **ctx.accounts.etf.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
            **ctx.accounts.lister.to_account_info().try_borrow_mut_lamports()? += transfer_amount;
        }
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeETF<'info> {
    #[account(
        init,
        payer = lister,
        space = 8 + 32 + (4 + 32 * 10) + 8 + 1,
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

#[account]
pub struct ETF {
    pub lister: Pubkey,
    pub token_addresses: Vec<Pubkey>,
    pub total_supply: u64,
    pub bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds for this operation")]
    InsufficientFunds,
    #[msg("Invalid amount specified")]
    InvalidAmount,
    #[msg("You are not authorized to perform this action")]
    Unauthorized,
}
