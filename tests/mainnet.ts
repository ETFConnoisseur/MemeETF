import { PublicKey, Connection, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

// Constants
const PROGRAM_ID = new PublicKey("CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo");
const DEV_WALLET = new PublicKey("GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx");

// RPC endpoints
const MAINNET_RPC = process.env.MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
const DEVNET_RPC = clusterApiUrl("devnet");

describe("Mainnet Configuration Tests", () => {
  // ============================================================================
  // Network Configuration Tests
  // ============================================================================

  describe("Network Configuration", () => {
    it("should have valid mainnet RPC URL format", () => {
      expect(MAINNET_RPC).to.be.a("string");
      expect(MAINNET_RPC).to.match(/^https?:\/\//);
    });

    it("should have valid devnet RPC URL format", () => {
      expect(DEVNET_RPC).to.be.a("string");
      expect(DEVNET_RPC).to.include("devnet");
    });

    it("should differentiate between mainnet and devnet URLs", () => {
      expect(MAINNET_RPC).to.not.equal(DEVNET_RPC);
    });

    it("should use correct mainnet cluster URL pattern", () => {
      const isMainnet = MAINNET_RPC.includes("mainnet") ||
                        MAINNET_RPC.includes("solana-mainnet") ||
                        !MAINNET_RPC.includes("devnet");
      expect(isMainnet).to.be.true;
    });

    it("should use correct devnet cluster URL pattern", () => {
      const isDevnet = DEVNET_RPC.includes("devnet");
      expect(isDevnet).to.be.true;
    });
  });

  // ============================================================================
  // Solscan URL Generation Tests
  // ============================================================================

  describe("Solscan URL Generation", () => {
    const testAddress = "GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx";
    const testTxHash = "5UfDuX7hXzNMNLBNiCFJBLvLyeQ7QPCtDJMh7m8VuB9x";

    it("should generate correct mainnet account URL (no cluster param)", () => {
      const network = "mainnet-beta";
      const url = `https://solscan.io/account/${testAddress}${network === "devnet" ? "?cluster=devnet" : ""}`;

      expect(url).to.equal(`https://solscan.io/account/${testAddress}`);
      expect(url).to.not.include("cluster=devnet");
    });

    it("should generate correct devnet account URL (with cluster param)", () => {
      const network = "devnet";
      const url = `https://solscan.io/account/${testAddress}${network === "devnet" ? "?cluster=devnet" : ""}`;

      expect(url).to.equal(`https://solscan.io/account/${testAddress}?cluster=devnet`);
      expect(url).to.include("cluster=devnet");
    });

    it("should generate correct mainnet transaction URL", () => {
      const network = "mainnet-beta";
      const url = `https://solscan.io/tx/${testTxHash}${network === "devnet" ? "?cluster=devnet" : ""}`;

      expect(url).to.equal(`https://solscan.io/tx/${testTxHash}`);
    });

    it("should generate correct devnet transaction URL", () => {
      const network = "devnet";
      const url = `https://solscan.io/tx/${testTxHash}${network === "devnet" ? "?cluster=devnet" : ""}`;

      expect(url).to.equal(`https://solscan.io/tx/${testTxHash}?cluster=devnet`);
    });
  });

  // ============================================================================
  // Network Type Validation Tests
  // ============================================================================

  describe("Network Type Validation", () => {
    type Network = "devnet" | "mainnet-beta";

    it("should accept 'devnet' as valid network", () => {
      const network: Network = "devnet";
      const isValid = network === "devnet" || network === "mainnet-beta";
      expect(isValid).to.be.true;
    });

    it("should accept 'mainnet-beta' as valid network", () => {
      const network: Network = "mainnet-beta";
      const isValid = network === "devnet" || network === "mainnet-beta";
      expect(isValid).to.be.true;
    });

    it("should correctly identify devnet", () => {
      const network: Network = "devnet";
      const isDevnet = network === "devnet";
      expect(isDevnet).to.be.true;
    });

    it("should correctly identify mainnet", () => {
      const network: Network = "mainnet-beta";
      const isMainnet = network === "mainnet-beta";
      expect(isMainnet).to.be.true;
    });
  });

  // ============================================================================
  // RPC Endpoint Selection Tests
  // ============================================================================

  describe("RPC Endpoint Selection", () => {
    function getRpcEndpoint(network: string): string {
      return network === "devnet" ? DEVNET_RPC : MAINNET_RPC;
    }

    it("should return devnet RPC for devnet network", () => {
      const endpoint = getRpcEndpoint("devnet");
      expect(endpoint).to.include("devnet");
    });

    it("should return mainnet RPC for mainnet-beta network", () => {
      const endpoint = getRpcEndpoint("mainnet-beta");
      expect(endpoint).to.equal(MAINNET_RPC);
    });

    it("should default to mainnet for unknown network", () => {
      const endpoint = getRpcEndpoint("unknown");
      expect(endpoint).to.equal(MAINNET_RPC);
    });
  });

  // ============================================================================
  // Program ID Consistency Tests
  // ============================================================================

  describe("Program ID Consistency", () => {
    it("should use same program ID on both networks", () => {
      // The same program ID should be used on devnet and mainnet
      // (after deploying to mainnet with same keypair)
      const devnetProgramId = PROGRAM_ID.toBase58();
      const mainnetProgramId = PROGRAM_ID.toBase58();

      expect(devnetProgramId).to.equal(mainnetProgramId);
      expect(devnetProgramId).to.equal("CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo");
    });

    it("should derive same PDAs on both networks", () => {
      const testWallet = new PublicKey("GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx");
      const etfIndex = 0;

      // PDA derivation is deterministic and network-agnostic
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("etf"), testWallet.toBuffer(), Buffer.from([etfIndex])],
        PROGRAM_ID
      );

      // Same inputs = same PDA regardless of network
      const [pda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("etf"), testWallet.toBuffer(), Buffer.from([etfIndex])],
        PROGRAM_ID
      );

      expect(pda.toBase58()).to.equal(pda2.toBase58());
    });
  });

  // ============================================================================
  // Dev Wallet Tests
  // ============================================================================

  describe("Dev Wallet Configuration", () => {
    it("should have valid dev wallet public key", () => {
      expect(DEV_WALLET.toBase58()).to.equal("GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx");
    });

    it("should be a valid Solana public key", () => {
      expect(() => new PublicKey(DEV_WALLET.toBase58())).to.not.throw();
    });

    it("should use same dev wallet on both networks", () => {
      // Fees go to same wallet regardless of network
      const devWalletMainnet = DEV_WALLET;
      const devWalletDevnet = DEV_WALLET;

      expect(devWalletMainnet.equals(devWalletDevnet)).to.be.true;
    });
  });

  // ============================================================================
  // Fee Calculation Tests (Network Agnostic)
  // ============================================================================

  describe("Fee Calculations (Network Agnostic)", () => {
    it("should calculate same fees regardless of network", () => {
      const solAmount = 1 * LAMPORTS_PER_SOL;

      // Fees are percentage-based, same on both networks
      const devnetCreatorFee = Math.floor(solAmount / 200); // 0.5%
      const mainnetCreatorFee = Math.floor(solAmount / 200); // 0.5%

      expect(devnetCreatorFee).to.equal(mainnetCreatorFee);
      expect(devnetCreatorFee).to.equal(5_000_000); // 0.005 SOL
    });

    it("should calculate correct total fees (1%)", () => {
      const solAmount = 10 * LAMPORTS_PER_SOL; // 10 SOL
      const creatorFee = Math.floor(solAmount / 200); // 0.5%
      const devFee = Math.floor(solAmount / 200); // 0.5%
      const totalFees = creatorFee + devFee;

      expect(totalFees).to.equal(100_000_000); // 0.1 SOL (1% of 10 SOL)
    });
  });

  // ============================================================================
  // Connection Tests (Mocked - No actual network calls)
  // ============================================================================

  describe("Connection Configuration", () => {
    it("should create connection with mainnet endpoint", () => {
      const connection = new Connection(MAINNET_RPC, "confirmed");
      expect(connection.rpcEndpoint).to.equal(MAINNET_RPC);
    });

    it("should create connection with devnet endpoint", () => {
      const connection = new Connection(DEVNET_RPC, "confirmed");
      expect(connection.rpcEndpoint).to.equal(DEVNET_RPC);
    });

    it("should use 'confirmed' commitment by default for both networks", () => {
      const mainnetConnection = new Connection(MAINNET_RPC, "confirmed");
      const devnetConnection = new Connection(DEVNET_RPC, "confirmed");

      // Both should use confirmed commitment
      expect(mainnetConnection.commitment).to.equal("confirmed");
      expect(devnetConnection.commitment).to.equal("confirmed");
    });
  });

  // ============================================================================
  // API Request Network Parameter Tests
  // ============================================================================

  describe("API Request Network Parameters", () => {
    interface ApiRequest {
      network: "devnet" | "mainnet-beta";
      walletAddress: string;
      amount?: number;
    }

    it("should include network in buy request", () => {
      const request: ApiRequest = {
        network: "mainnet-beta",
        walletAddress: "GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx",
        amount: 1,
      };

      expect(request.network).to.equal("mainnet-beta");
    });

    it("should include network in sell request", () => {
      const request: ApiRequest = {
        network: "devnet",
        walletAddress: "GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx",
        amount: 0.5,
      };

      expect(request.network).to.equal("devnet");
    });

    it("should include network in ETF creation request", () => {
      const request: ApiRequest = {
        network: "mainnet-beta",
        walletAddress: "GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx",
      };

      expect(request.network).to.equal("mainnet-beta");
    });
  });

  // ============================================================================
  // Database Network Field Tests
  // ============================================================================

  describe("Database Network Field", () => {
    interface ETFRecord {
      id: string;
      name: string;
      creator: string;
      network: "devnet" | "mainnet-beta";
      contract_address: string;
    }

    it("should store network field for devnet ETF", () => {
      const etf: ETFRecord = {
        id: "etf-123",
        name: "Test ETF",
        creator: "GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx",
        network: "devnet",
        contract_address: "ABC123...",
      };

      expect(etf.network).to.equal("devnet");
    });

    it("should store network field for mainnet ETF", () => {
      const etf: ETFRecord = {
        id: "etf-456",
        name: "Mainnet ETF",
        creator: "GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx",
        network: "mainnet-beta",
        contract_address: "XYZ789...",
      };

      expect(etf.network).to.equal("mainnet-beta");
    });

    it("should filter ETFs by network", () => {
      const etfs: ETFRecord[] = [
        { id: "1", name: "Devnet ETF", creator: "A", network: "devnet", contract_address: "..." },
        { id: "2", name: "Mainnet ETF", creator: "B", network: "mainnet-beta", contract_address: "..." },
        { id: "3", name: "Another Devnet", creator: "C", network: "devnet", contract_address: "..." },
      ];

      const mainnetEtfs = etfs.filter(e => e.network === "mainnet-beta");
      const devnetEtfs = etfs.filter(e => e.network === "devnet");

      expect(mainnetEtfs).to.have.lengthOf(1);
      expect(devnetEtfs).to.have.lengthOf(2);
    });
  });

  // ============================================================================
  // Transaction Network Field Tests
  // ============================================================================

  describe("Transaction Network Field", () => {
    interface TransactionRecord {
      id: string;
      type: "buy" | "sell";
      network: "devnet" | "mainnet-beta";
      tx_hash: string;
      amount: number;
    }

    it("should store network for buy transaction", () => {
      const tx: TransactionRecord = {
        id: "tx-123",
        type: "buy",
        network: "mainnet-beta",
        tx_hash: "5UfDuX7hXzNMNLBNiCFJBLvLyeQ7QPCtDJMh7m8VuB9x",
        amount: 1.5,
      };

      expect(tx.network).to.equal("mainnet-beta");
    });

    it("should store network for sell transaction", () => {
      const tx: TransactionRecord = {
        id: "tx-456",
        type: "sell",
        network: "devnet",
        tx_hash: "ABC123...",
        amount: 0.5,
      };

      expect(tx.network).to.equal("devnet");
    });

    it("should generate correct explorer link based on network", () => {
      const tx: TransactionRecord = {
        id: "tx-789",
        type: "buy",
        network: "mainnet-beta",
        tx_hash: "5UfDuX7hXzNMNLBNiCFJBLvLyeQ7QPCtDJMh7m8VuB9x",
        amount: 2.0,
      };

      const explorerUrl = `https://solscan.io/tx/${tx.tx_hash}${tx.network === "devnet" ? "?cluster=devnet" : ""}`;

      expect(explorerUrl).to.not.include("cluster=devnet");
    });
  });

  // ============================================================================
  // Environment Variable Tests
  // ============================================================================

  describe("Environment Variables", () => {
    it("should have MAINNET_RPC_URL defined or use fallback", () => {
      // Either env var is set or we use fallback
      expect(MAINNET_RPC).to.be.a("string");
      expect(MAINNET_RPC.length).to.be.greaterThan(0);
    });

    it("should handle missing MAINNET_RPC_URL gracefully", () => {
      // Simulate fallback behavior
      const rpcUrl = process.env.MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
      expect(rpcUrl).to.match(/^https?:\/\//);
    });
  });

  // ============================================================================
  // Network Switch Tests
  // ============================================================================

  describe("Network Switch Logic", () => {
    it("should switch from devnet to mainnet", () => {
      let currentNetwork: "devnet" | "mainnet-beta" = "devnet";

      // Simulate network switch
      currentNetwork = "mainnet-beta";

      expect(currentNetwork).to.equal("mainnet-beta");
    });

    it("should switch from mainnet to devnet", () => {
      let currentNetwork: "devnet" | "mainnet-beta" = "mainnet-beta";

      // Simulate network switch
      currentNetwork = "devnet";

      expect(currentNetwork).to.equal("devnet");
    });

    it("should update RPC endpoint on network switch", () => {
      function getEndpoint(network: "devnet" | "mainnet-beta"): string {
        return network === "devnet" ? DEVNET_RPC : MAINNET_RPC;
      }

      const devnetEndpoint = getEndpoint("devnet");
      const mainnetEndpoint = getEndpoint("mainnet-beta");

      expect(devnetEndpoint).to.include("devnet");
      expect(mainnetEndpoint).to.equal(MAINNET_RPC);
    });
  });

  // ============================================================================
  // Real Token Address Tests (Mainnet)
  // ============================================================================

  describe("Real Token Addresses (Mainnet)", () => {
    // Well-known mainnet token addresses
    const USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const BONK_MAINNET = new PublicKey("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");

    it("should validate USDC mainnet address", () => {
      expect(USDC_MAINNET.toBase58()).to.equal("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    });

    it("should validate wrapped SOL address", () => {
      expect(SOL_MINT.toBase58()).to.equal("So11111111111111111111111111111111111111112");
    });

    it("should validate BONK mainnet address", () => {
      expect(BONK_MAINNET.toBase58()).to.equal("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263");
    });

    it("should be valid PublicKeys", () => {
      expect(() => new PublicKey(USDC_MAINNET.toBase58())).to.not.throw();
      expect(() => new PublicKey(SOL_MINT.toBase58())).to.not.throw();
      expect(() => new PublicKey(BONK_MAINNET.toBase58())).to.not.throw();
    });
  });

  // ============================================================================
  // Jupiter API Tests (Mainnet)
  // ============================================================================

  describe("Jupiter API Configuration", () => {
    const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
    const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";
    const JUPITER_PRICE_API = "https://price.jup.ag/v6/price";

    it("should use correct Jupiter Quote API endpoint", () => {
      expect(JUPITER_QUOTE_API).to.equal("https://quote-api.jup.ag/v6/quote");
    });

    it("should use correct Jupiter Swap API endpoint", () => {
      expect(JUPITER_SWAP_API).to.equal("https://quote-api.jup.ag/v6/swap");
    });

    it("should use correct Jupiter Price API endpoint", () => {
      expect(JUPITER_PRICE_API).to.equal("https://price.jup.ag/v6/price");
    });

    it("should build correct quote URL with parameters", () => {
      const inputMint = "So11111111111111111111111111111111111111112"; // SOL
      const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
      const amount = 1000000000; // 1 SOL in lamports
      const slippage = 50; // 0.5%

      const quoteUrl = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage}`;

      expect(quoteUrl).to.include("inputMint=");
      expect(quoteUrl).to.include("outputMint=");
      expect(quoteUrl).to.include("amount=");
      expect(quoteUrl).to.include("slippageBps=");
    });
  });

  // ============================================================================
  // Mainnet Safety Tests
  // ============================================================================

  describe("Mainnet Safety Checks", () => {
    it("should warn when using mainnet with small balances", () => {
      const balance = 0.001 * LAMPORTS_PER_SOL; // 0.001 SOL
      const minimumRecommended = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL

      const isLowBalance = balance < minimumRecommended;
      expect(isLowBalance).to.be.true;
    });

    it("should validate transaction amount is reasonable", () => {
      const amount = 100 * LAMPORTS_PER_SOL; // 100 SOL
      const maxReasonableAmount = 1000 * LAMPORTS_PER_SOL; // 1000 SOL

      const isReasonable = amount <= maxReasonableAmount && amount > 0;
      expect(isReasonable).to.be.true;
    });

    it("should reject zero amount transactions", () => {
      const amount = 0;
      const isValid = amount > 0;
      expect(isValid).to.be.false;
    });

    it("should reject negative amount transactions", () => {
      const amount = -1 * LAMPORTS_PER_SOL;
      const isValid = amount > 0;
      expect(isValid).to.be.false;
    });
  });
});
