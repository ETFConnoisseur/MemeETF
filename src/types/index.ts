// =============================================================================
// Frontend Types - Aligned with backend database schema
// =============================================================================

// Token information for ETF composition
export interface TokenAllocation {
  address: string;               // Token contract address
  symbol: string;                // Token symbol (e.g., SOL, USDC)
  name?: string;                 // Token name
  decimals?: number;             // Token decimals
  market_cap?: number;           // Current market cap
  weight?: number;               // Weight in ETF (percentage)
  pfp_url?: string;              // Token logo URL
  image?: string;                // Alternative image field
}

// ETF listing
export interface ETF {
  id: string;                    // UUID
  name: string;                  // ETF name
  creator: string;               // Creator's wallet address
  contract_address: string;      // On-chain contract address
  tokens: TokenAllocation[];     // Array of tokens in the ETF
  market_cap_at_list: number;    // Market cap at listing time
  token_hash?: string;           // Unique hash of token composition
  created_at: Date;
}

// Portfolio position
export interface PortfolioPosition {
  user_id: string;
  etf_id: string;
  amount: number;
  entry_price: number;
  current_value: number;
}

// Portfolio holding with ETF details
export interface PortfolioHolding {
  etf: ETF;
  position?: PortfolioPosition;
  investment?: Investment;  // Alternative structure from some API responses
  current_value: number;
  unrealized_pnl: number;
  performance_percentage: number;
}

// Transaction record
export interface Transaction {
  id: string;
  user_id: string;
  type: 'deposit' | 'withdrawal' | 'buy' | 'sell';
  amount: number;
  fees: number;
  etf_id?: string;
  tx_hash?: string;
  status: string;
  created_at: Date;
}

// Investment record (buy history)
export interface Investment {
  id: string;
  user_id: string;
  etf_id: string;
  sol_amount: number;
  entry_market_cap: number;
  tokens_received: number;
  created_at: Date;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ApiError {
  error: string;
}

// ETFs
export interface ETFsResponse {
  success: boolean;
  etfs: ETF[];
}

export interface ETFResponse {
  success: boolean;
  etf: ETF;
  txHash?: string;
}

// Portfolio
export interface PortfolioResponse {
  success: boolean;
  holdings: PortfolioHolding[];
  totalValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  availableBalance: number;
  transactions?: Transaction[];
  realizedPnlHistory?: Array<{ date: string; pnl: number }>;
}

// Leaderboard
export interface LeaderboardEntry {
  rank: number;
  etf_id: string;
  etf_name: string;
  user_id: string;
  twitter_handle: string | null;
  return_percentage: number;
  market_cap_at_list: number;
  current_market_cap: number;
  investment_count: number;
  total_invested: number;
  created_at: string;
}

export interface LeaderboardResponse {
  success: boolean;
  leaderboard: LeaderboardEntry[];
}

// Rewards
export interface ETFWithStats {
  etf: ETF;
  investment_count: number;
  total_invested: number;
  fees_earned: number;
}

export interface RewardItem {
  etf_id: string;
  etf_name: string;
  unclaimed: number;
  total_earned: number;
}

export interface RewardHistoryItem {
  date: string;
  amount: number;
  type: string;
}

export interface RewardsResponse {
  success: boolean;
  total_claimable: number;
  total_claimed: number;
  rewards: RewardItem[];
  history: RewardHistoryItem[];
}

export interface ClaimRewardsResponse {
  success: boolean;
  claimed: number;
  newBalance: number;
  txHash?: string;
}

// User / Wallet
export interface UserResponse {
  success: boolean;
  user: {
    wallet_address: string;
    x_username?: string;
    created_at: Date;
    updated_at?: Date;
  };
  protocolWallet?: {
    publicKey: string;
    balance: number;
    exportedKeys?: boolean;
  };
  isNew?: boolean;
}

export interface WalletResponse {
  success: boolean;
  wallet: {
    publicKey: string;
    balance: number;
  };
}

export interface BalanceResponse {
  success: boolean;
  balance: number;
  publicKey: string;
}

export interface DepositResponse {
  success: boolean;
  newBalance: number;
  txHash: string;
  message?: string;
}

export interface WithdrawResponse {
  success: boolean;
  txHash: string;
  newBalance: number;
}

// Investment
export interface InvestmentResponse {
  success: boolean;
  investment: {
    id: string;
    sol_amount: number;
    entry_market_cap: number;
    tokens_received: number;
    created_at: Date;
  };
  txHash: string;
  newBalance: number;
}

export interface SellResponse {
  success: boolean;
  solReturned: number;
  fees: number;
  txHash: string;
  newBalance: number;
}

// Token Info
export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  image?: string;
  marketCap?: number;
  decimals?: number;
}
