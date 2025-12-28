# MemeETF

Create and share curated meme token baskets on Solana.

## What is MemeETF?

MemeETF lets you bundle your favorite meme tokens into a single ETF that others can invest in with one click. No more overwhelming research for newcomers - just pick an ETF from someone who's done the work.

- **Create ETFs**: Bundle up to 10 meme tokens with custom weights
- **Share & Earn**: Get 0.5% fee on every buy/sell of your ETF
- **Invest Easily**: One-click investment into curated token baskets
- **Leaderboard**: See which ETF creators are winning

## Tech Stack

### Frontend
- Vite + React
- Tailwind CSS
- Solana Wallet Adapter (Phantom, Solflare)

### Backend
- Next.js API Routes
- PostgreSQL (Supabase)
- Jupiter Swap API (Ultra + v6)

### On-Chain (Solana)
- Anchor Framework (Rust)
- Program ID: `CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo`

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  React Frontend │────▶│  Next.js API    │────▶│  Solana Program │
│  (Vite)         │     │  Routes         │     │  (Anchor/Rust)  │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │                 │
                        │  PostgreSQL     │
                        │  (Supabase)     │
                        │                 │
                        └─────────────────┘
```

## Fee Structure

- **1% total fee** on all buys and sells
  - 0.5% to ETF creator
  - 0.5% to platform
- Fees are distributed automatically in the smart contract

## Smart Contract

The Anchor program handles:

- **ETF Creation**: Up to 5 ETFs per wallet, 10 tokens per ETF
- **Buy/Sell**: Automatic fee distribution to creator and platform
- **PDA Structure**: `seeds = ["etf", lister_wallet, etf_index]`

### Key Functions

```rust
// Create a new ETF
pub fn initialize_etf(ctx, etf_index, token_addresses) -> Result<()>

// Buy into an ETF (fees auto-distributed)
pub fn buy_etf(ctx, sol_amount, token_percentages) -> Result<()>

// Sell ETF position (fees auto-distributed)
pub fn sell_etf(ctx, tokens_to_sell) -> Result<()>

// Close an empty ETF
pub fn close_etf(ctx) -> Result<()>
```

## API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/etfs` | GET | List all ETFs |
| `/api/etfs/prepare` | POST | Build unsigned ETF creation tx |
| `/api/etfs/confirm` | POST | Verify on-chain + save to DB |
| `/api/etfs/[id]` | GET | Get ETF details |
| `/api/investments/prepare` | POST | Build swap transactions |
| `/api/leaderboard` | GET | Get ETF rankings |

## Setup

### Prerequisites

- Node.js >= 20
- Rust + Anchor CLI (for smart contract development)
- Solana CLI

### Environment Variables

Create a `.env.local` file:

```env
# Solana RPC
MAINNET_RPC_URL=https://your-rpc-endpoint.com

# Database
DATABASE_URL=postgresql://user:password@host/database

# Program
PROGRAM_ID=CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo
```

### Installation

```bash
# Install dependencies
npm install

# Run development server (frontend on :3001, API on :3000)
npm run dev

# Build for production
npm run build
```

### Smart Contract Development

```bash
# Build the program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet
```

## Network Support

- **Devnet**: For testing. Token swaps go to devnet USDC.
- **Mainnet**: Real Jupiter swaps to actual meme tokens.

The app auto-detects and handles both networks.

## Security

- **Non-custodial**: Users sign all transactions with their own wallet
- **On-chain fees**: Dev wallet is hardcoded in the smart contract
- **No private keys**: Backend never handles user funds

## Project Structure

```
├── app/
│   └── api/              # Next.js API routes
├── lib/
│   ├── anchor/           # Anchor client
│   ├── database/         # PostgreSQL connection
│   └── solana/           # Jupiter swaps, program utils
├── programs/
│   └── mtf-etf/          # Anchor smart contract (Rust)
├── src/
│   ├── components/       # React components
│   ├── contexts/         # React contexts
│   └── pages/            # Page components
└── public/               # Static assets
```

## License

MIT
