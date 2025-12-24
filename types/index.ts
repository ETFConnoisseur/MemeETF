// User type - wallet_address is the primary identifier
export interface User {
  wallet_address: string; // Primary key - Solana wallet address
  x_username?: string;    // Optional X/Twitter handle
  created_at: Date;
  updated_at: Date;
}

// Protocol wallet for each user
export interface Wallet {
  id: string;                    // UUID
  user_id: string;               // References users.wallet_address
  public_key: string;            // Protocol wallet public key
  sol_balance: number;           // Balance in SOL
  exported_keys: boolean;        // Whether keys have been exported
  created_at: Date;
  updated_at: Date;
}

// Token information for ETF composition
export interface TokenInfo {
  address: string;               // Token contract address
  symbol: string;                // Token symbol (e.g., SOL, USDC)
  name?: string;                 // Token name
  decimals?: number;             // Token decimals
  market_cap?: number;           // Current market cap
  weight?: number;               // Weight in ETF (percentage)
  pfp_url?: string;              // Token logo URL
  image?: string;                 // Token image/logo URL (alternative to pfp_url)
}

// ETF listing
export interface ETF {
  id: string;                    // UUID
  name: string;                  // ETF name
  creator: string;               // References users.wallet_address
  contract_address: string;      // On-chain contract address
  tokens: TokenInfo[];           // Array of tokens in the ETF
  market_cap_at_list: number;    // Market cap at listing time
  token_hash: string;            // Unique hash of token composition
  created_at: Date;
}

// Investment record (buy history)
export interface Investment {
  id: string;                    // UUID
  user_id: string;               // References users.wallet_address
  etf_id: string;                // References etf_listings.id
  sol_amount: number;            // Amount invested in SOL
  entry_market_cap: number;      // Market cap at entry
  tokens_received: number;       // ETF tokens received
  created_at: Date;
}

// Transaction record
export interface Transaction {
  id: string;                    // UUID
  user_id: string;               // References users.wallet_address
  type: 'deposit' | 'withdrawal' | 'buy' | 'sell';
  amount: number;                // Amount in SOL
  status: string;                // pending, completed, failed
  tx_hash?: string;              // Solana transaction signature
  fees: number;                  // Transaction fees
  etf_id?: string;               // Related ETF if applicable
  created_at: Date;
}

// Portfolio holding (current position)
export interface PortfolioPosition {
  user_id: string;               // References users.wallet_address
  etf_id: string;                // References etf_listings.id
  amount: number;                // Amount of ETF tokens held
  entry_price: number;           // Average entry price
  current_value: number;         // Current value in SOL
}

// Fee record
export interface Fee {
  id: string;                    // UUID
  etf_id: string;                // References etf_listings.id
  lister_fee: number;            // Fee earned by lister
  platform_fee: number;          // Fee for platform
  paid_out: boolean;             // Whether fee has been paid
  created_at: Date;
}

// Performance data (for tracking)
export interface Performance {
  id: string;
  etf_id: string;
  timestamp: Date;
  current_market_cap: number;
  performance_percentage: number;
}

// API Response types
export interface PortfolioHolding {
  etf: ETF;
  position: PortfolioPosition;
  current_value: number;
  unrealized_pnl: number;
  performance_percentage: number;
}

export interface LeaderboardEntry {
  etf: ETF;
  performance: number;
  current_market_cap: number;
  rank: number;
}

export interface RewardsData {
  feesEarned: number;           // Total fees earned as lister
  feesPaid: number;             // Total fees paid as investor
  unclaimedFees: number;        // Fees available to claim
  totalROI: number;             // Return on investment percentage
}

// Request/Response types for API
export interface CreateWalletRequest {
  userId: string;               // External wallet address
}

export interface CreateETFRequest {
  name: string;
  tokens: TokenInfo[];
  userId: string;               // Creator's wallet address
}

export interface CreateInvestmentRequest {
  etfId: string;
  solAmount: number;
  userId: string;
}

export interface DepositRequest {
  userId: string;
  amount: number;
  txHash: string;
}

export interface WithdrawRequest {
  userId: string;
  address: string;              // Destination address
  amount: number;
}
