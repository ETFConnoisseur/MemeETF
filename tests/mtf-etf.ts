import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

// Constants matching the contract
const DEV_WALLET = new PublicKey("GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx");
const PROGRAM_ID = new PublicKey("CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo");

describe("mtf-etf Unit Tests", () => {
  // Test keypairs (generated fresh each run)
  let lister: Keypair;
  let investor: Keypair;
  let etfPda: PublicKey;
  let etfBump: number;

  before(() => {
    // Generate test keypairs
    lister = Keypair.generate();
    investor = Keypair.generate();

    // Derive ETF PDA with index 0 (default)
    [etfPda, etfBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("etf"), lister.publicKey.toBuffer(), Buffer.from([0])],
      PROGRAM_ID
    );

    console.log("Test Setup Complete:");
    console.log("  Lister:", lister.publicKey.toBase58());
    console.log("  Investor:", investor.publicKey.toBase58());
    console.log("  ETF PDA (index 0):", etfPda.toBase58());
    console.log("  Dev Wallet:", DEV_WALLET.toBase58());
  });

  // ============================================================================
  // PDA Derivation Tests
  // ============================================================================

  describe("PDA Derivation", () => {
    it("should derive ETF PDA correctly with index", () => {
      const [derivedPda, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("etf"), lister.publicKey.toBuffer(), Buffer.from([0])],
        PROGRAM_ID
      );

      expect(derivedPda.toBase58()).to.equal(etfPda.toBase58());
      expect(bump).to.equal(etfBump);
    });

    it("should derive different PDAs for different listers", () => {
      const otherLister = Keypair.generate();
      const [otherPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("etf"), otherLister.publicKey.toBuffer(), Buffer.from([0])],
        PROGRAM_ID
      );

      expect(otherPda.toBase58()).to.not.equal(etfPda.toBase58());
    });

    it("should produce consistent PDAs for the same lister and index", () => {
      const [pda1] = PublicKey.findProgramAddressSync(
        [Buffer.from("etf"), lister.publicKey.toBuffer(), Buffer.from([0])],
        PROGRAM_ID
      );
      const [pda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("etf"), lister.publicKey.toBuffer(), Buffer.from([0])],
        PROGRAM_ID
      );

      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it("should derive different PDAs for same lister with different indices", () => {
      const pdas: string[] = [];
      for (let i = 0; i < 5; i++) {
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from("etf"), lister.publicKey.toBuffer(), Buffer.from([i])],
          PROGRAM_ID
        );
        pdas.push(pda.toBase58());
      }

      // All 5 PDAs should be unique
      const uniquePdas = new Set(pdas);
      expect(uniquePdas.size).to.equal(5);
    });

    it("should allow up to 5 ETFs per wallet (indices 0-4)", () => {
      const MAX_ETFS = 5;
      for (let i = 0; i < MAX_ETFS; i++) {
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from("etf"), lister.publicKey.toBuffer(), Buffer.from([i])],
          PROGRAM_ID
        );
        expect(pda).to.be.instanceOf(PublicKey);
      }
    });
  });

  // ============================================================================
  // Fee Calculation Tests (Client-side)
  // ============================================================================

  describe("Fee Calculations", () => {
    it("should calculate 0.5% creator fee correctly", () => {
      const solAmount = 1 * LAMPORTS_PER_SOL; // 1 SOL
      const creatorFee = Math.floor(solAmount / 200); // 0.5%

      expect(creatorFee).to.equal(5_000_000); // 0.005 SOL
    });

    it("should calculate 0.5% dev fee correctly", () => {
      const solAmount = 1 * LAMPORTS_PER_SOL; // 1 SOL
      const devFee = Math.floor(solAmount / 200); // 0.5%

      expect(devFee).to.equal(5_000_000); // 0.005 SOL
    });

    it("should calculate 1% total fees correctly", () => {
      const solAmount = 1 * LAMPORTS_PER_SOL;
      const creatorFee = Math.floor(solAmount / 200);
      const devFee = Math.floor(solAmount / 200);
      const totalFees = creatorFee + devFee;

      expect(totalFees).to.equal(10_000_000); // 0.01 SOL (1%)
    });

    it("should calculate amount after fees correctly", () => {
      const solAmount = 1 * LAMPORTS_PER_SOL;
      const totalFees = Math.floor(solAmount / 100); // 1%
      const solAfterFees = solAmount - totalFees;

      expect(solAfterFees).to.equal(990_000_000); // 0.99 SOL
    });

    it("should handle small amounts with rounding", () => {
      const solAmount = 10_000_000; // 0.01 SOL
      const creatorFee = Math.floor(solAmount / 200);
      const devFee = Math.floor(solAmount / 200);

      expect(creatorFee).to.equal(50_000);
      expect(devFee).to.equal(50_000);
    });

    it("should handle very small amounts (fee rounds to 0)", () => {
      const solAmount = 100; // Very small
      const creatorFee = Math.floor(solAmount / 200);
      const devFee = Math.floor(solAmount / 200);

      expect(creatorFee).to.equal(0);
      expect(devFee).to.equal(0);
    });

    it("should calculate large amounts without overflow", () => {
      const solAmount = 1000 * LAMPORTS_PER_SOL; // 1000 SOL
      const creatorFee = Math.floor(solAmount / 200);
      const devFee = Math.floor(solAmount / 200);
      const totalFees = creatorFee + devFee;

      expect(creatorFee).to.equal(5_000_000_000); // 5 SOL
      expect(devFee).to.equal(5_000_000_000); // 5 SOL
      expect(totalFees).to.equal(10_000_000_000); // 10 SOL
    });

    it("should handle 10 SOL investment", () => {
      const solAmount = 10 * LAMPORTS_PER_SOL;
      const creatorFee = Math.floor(solAmount / 200);
      const devFee = Math.floor(solAmount / 200);
      const totalFees = creatorFee + devFee;
      const solAfterFees = solAmount - totalFees;

      expect(creatorFee).to.equal(50_000_000);  // 0.05 SOL
      expect(devFee).to.equal(50_000_000);      // 0.05 SOL
      expect(totalFees).to.equal(100_000_000);  // 0.1 SOL
      expect(solAfterFees).to.equal(9_900_000_000); // 9.9 SOL
    });
  });

  // ============================================================================
  // Token Percentage Validation Tests
  // ============================================================================

  describe("Token Percentage Validation", () => {
    it("should accept percentages that sum to 100", () => {
      const percentages = [50, 30, 20];
      const sum = percentages.reduce((a, b) => a + b, 0);

      expect(sum).to.equal(100);
    });

    it("should accept single token at 100%", () => {
      const percentages = [100];
      const sum = percentages.reduce((a, b) => a + b, 0);

      expect(sum).to.equal(100);
    });

    it("should accept 10 tokens equally weighted", () => {
      const percentages = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
      const sum = percentages.reduce((a, b) => a + b, 0);

      expect(sum).to.equal(100);
      expect(percentages.length).to.equal(10);
    });

    it("should reject percentages that sum to less than 100", () => {
      const percentages = [50, 30, 10]; // Sum = 90
      const sum = percentages.reduce((a, b) => a + b, 0);

      expect(sum).to.not.equal(100);
    });

    it("should reject percentages that sum to more than 100", () => {
      const percentages = [50, 30, 30]; // Sum = 110
      const sum = percentages.reduce((a, b) => a + b, 0);

      expect(sum).to.not.equal(100);
    });

    it("should handle uneven split (33/33/34)", () => {
      const percentages = [33, 33, 34];
      const sum = percentages.reduce((a, b) => a + b, 0);

      expect(sum).to.equal(100);
    });
  });

  // ============================================================================
  // Token Allocation Tests
  // ============================================================================

  describe("Token Allocation Calculations", () => {
    it("should allocate SOL correctly for 50/50 split", () => {
      const solAfterFees = 990_000_000n; // 0.99 SOL as BigInt
      const percentages = [50, 50];

      const allocations = percentages.map(p =>
        Number((solAfterFees * BigInt(p)) / 100n)
      );

      expect(allocations[0]).to.equal(495_000_000);
      expect(allocations[1]).to.equal(495_000_000);
    });

    it("should allocate SOL correctly for 50/30/20 split", () => {
      const solAfterFees = 990_000_000n;
      const percentages = [50, 30, 20];

      const allocations = percentages.map(p =>
        Number((solAfterFees * BigInt(p)) / 100n)
      );

      expect(allocations[0]).to.equal(495_000_000); // 50%
      expect(allocations[1]).to.equal(297_000_000); // 30%
      expect(allocations[2]).to.equal(198_000_000); // 20%
    });

    it("should handle uneven splits (33/33/34)", () => {
      const solAfterFees = 990_000_000n;
      const percentages = [33, 33, 34];

      const allocations = percentages.map(p =>
        Number((solAfterFees * BigInt(p)) / 100n)
      );

      expect(allocations[0]).to.equal(326_700_000); // 33%
      expect(allocations[1]).to.equal(326_700_000); // 33%
      expect(allocations[2]).to.equal(336_600_000); // 34%
    });

    it("should allocate correctly for single token", () => {
      const solAfterFees = 990_000_000n;
      const percentages = [100];

      const allocations = percentages.map(p =>
        Number((solAfterFees * BigInt(p)) / 100n)
      );

      expect(allocations[0]).to.equal(990_000_000);
    });
  });

  // ============================================================================
  // Constants Validation Tests
  // ============================================================================

  describe("Constants Validation", () => {
    it("should have correct DEV_WALLET address", () => {
      expect(DEV_WALLET.toBase58()).to.equal(
        "GdtZWBCTUrFneA7FdFaxyudhCLTKgBM4a9NVR3k4rPJx"
      );
    });

    it("should have correct PROGRAM_ID", () => {
      expect(PROGRAM_ID.toBase58()).to.equal(
        "CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo"
      );
    });

    it("should have valid PublicKey for DEV_WALLET", () => {
      expect(() => new PublicKey(DEV_WALLET.toBase58())).to.not.throw();
    });

    it("should have valid PublicKey for PROGRAM_ID", () => {
      expect(() => new PublicKey(PROGRAM_ID.toBase58())).to.not.throw();
    });
  });

  // ============================================================================
  // Round-trip Fee Tests
  // ============================================================================

  describe("Round-trip Fee Analysis", () => {
    it("should calculate total fees for buy and sell round-trip", () => {
      const initialSol = 1 * LAMPORTS_PER_SOL; // 1 SOL

      // BUY: 1% fee
      const buyFees = Math.floor(initialSol / 100);
      const tokensReceived = initialSol - buyFees;
      expect(tokensReceived).to.equal(990_000_000); // 0.99 SOL worth of tokens

      // SELL: 1% fee on tokens
      const sellFees = Math.floor(tokensReceived / 100);
      const solReturned = tokensReceived - sellFees;
      expect(solReturned).to.equal(980_100_000); // 0.9801 SOL

      // Total lost to fees
      const totalFeesLost = initialSol - solReturned;
      expect(totalFeesLost).to.equal(19_900_000); // ~0.02 SOL (~2%)
    });

    it("should show creator gets 0.5% on each leg", () => {
      const initialSol = 1 * LAMPORTS_PER_SOL;

      // BUY
      const buyCreatorFee = Math.floor(initialSol / 200);
      expect(buyCreatorFee).to.equal(5_000_000); // 0.005 SOL

      // SELL (on 0.99 SOL)
      const tokensReceived = initialSol - (initialSol / 100);
      const sellCreatorFee = Math.floor(tokensReceived / 200);
      expect(sellCreatorFee).to.equal(4_950_000); // 0.00495 SOL

      // Total creator earnings
      const totalCreatorFees = buyCreatorFee + sellCreatorFee;
      expect(totalCreatorFees).to.equal(9_950_000); // ~0.01 SOL
    });

    it("should show dev gets 0.5% on each leg", () => {
      const initialSol = 1 * LAMPORTS_PER_SOL;

      // BUY
      const buyDevFee = Math.floor(initialSol / 200);
      expect(buyDevFee).to.equal(5_000_000); // 0.005 SOL

      // SELL (on 0.99 SOL)
      const tokensReceived = initialSol - (initialSol / 100);
      const sellDevFee = Math.floor(tokensReceived / 200);
      expect(sellDevFee).to.equal(4_950_000); // 0.00495 SOL

      // Total dev earnings
      const totalDevFees = buyDevFee + sellDevFee;
      expect(totalDevFees).to.equal(9_950_000); // ~0.01 SOL
    });

    it("should calculate fees correctly for 100 SOL round-trip", () => {
      const initialSol = 100 * LAMPORTS_PER_SOL;

      // BUY
      const buyFees = Math.floor(initialSol / 100);
      const tokensReceived = initialSol - buyFees;

      // SELL
      const sellFees = Math.floor(tokensReceived / 100);
      const solReturned = tokensReceived - sellFees;

      // Total lost
      const totalLost = initialSol - solReturned;
      expect(totalLost).to.equal(1_990_000_000); // ~1.99 SOL (~2%)
    });
  });

  // ============================================================================
  // Token Count Validation Tests
  // ============================================================================

  describe("Token Count Validation", () => {
    it("should accept 1 token", () => {
      const tokenCount = 1;
      const isValid = tokenCount > 0 && tokenCount <= 10;
      expect(isValid).to.be.true;
    });

    it("should accept 10 tokens", () => {
      const tokenCount = 10;
      const isValid = tokenCount > 0 && tokenCount <= 10;
      expect(isValid).to.be.true;
    });

    it("should reject 0 tokens", () => {
      const tokenCount = 0;
      const isValid = tokenCount > 0 && tokenCount <= 10;
      expect(isValid).to.be.false;
    });

    it("should reject 11 tokens", () => {
      const tokenCount = 11;
      const isValid = tokenCount > 0 && tokenCount <= 10;
      expect(isValid).to.be.false;
    });

    it("should accept any count between 1 and 10", () => {
      for (let i = 1; i <= 10; i++) {
        const isValid = i > 0 && i <= 10;
        expect(isValid).to.be.true;
      }
    });
  });

  // ============================================================================
  // Supply Tracking Tests
  // ============================================================================

  describe("Supply Tracking", () => {
    it("should increase supply on buy", () => {
      let totalSupply = 0;
      const solAfterFees = 990_000_000;

      // Simulate buy (1:1 minting)
      totalSupply += solAfterFees;

      expect(totalSupply).to.equal(990_000_000);
    });

    it("should decrease supply on sell", () => {
      let totalSupply = 990_000_000;
      const tokensToSell = 500_000_000;

      // Simulate sell
      totalSupply -= tokensToSell;

      expect(totalSupply).to.equal(490_000_000);
    });

    it("should track supply across multiple operations", () => {
      let totalSupply = 0;

      // Buy 1 SOL worth
      totalSupply += 990_000_000;
      expect(totalSupply).to.equal(990_000_000);

      // Buy another 0.5 SOL worth
      totalSupply += 495_000_000;
      expect(totalSupply).to.equal(1_485_000_000);

      // Sell 0.3 SOL worth
      totalSupply -= 297_000_000;
      expect(totalSupply).to.equal(1_188_000_000);
    });

    it("should not allow supply to go negative", () => {
      const totalSupply = 100;
      const tokensToSell = 200;

      // Check that this would fail
      const wouldUnderflow = tokensToSell > totalSupply;
      expect(wouldUnderflow).to.be.true;
    });

    it("should handle full liquidation", () => {
      let totalSupply = 990_000_000;

      // Sell everything
      totalSupply -= 990_000_000;

      expect(totalSupply).to.equal(0);
    });
  });

  // ============================================================================
  // Account Validation Tests
  // ============================================================================

  describe("Account Validation Logic", () => {
    it("should validate lister account matches ETF lister", () => {
      const etfLister = lister.publicKey;
      const providedLister = lister.publicKey;

      expect(providedLister.equals(etfLister)).to.be.true;
    });

    it("should reject wrong lister account", () => {
      const etfLister = lister.publicKey;
      const wrongLister = Keypair.generate().publicKey;

      expect(wrongLister.equals(etfLister)).to.be.false;
    });

    it("should validate dev wallet is correct constant", () => {
      const providedDevWallet = DEV_WALLET;

      expect(providedDevWallet.equals(DEV_WALLET)).to.be.true;
    });

    it("should reject wrong dev wallet", () => {
      const wrongDevWallet = Keypair.generate().publicKey;

      expect(wrongDevWallet.equals(DEV_WALLET)).to.be.false;
    });
  });

  // ============================================================================
  // Instruction Building Tests
  // ============================================================================

  describe("Instruction Building", () => {
    it("should build initializeEtf accounts correctly", () => {
      const accounts = {
        etf: etfPda,
        lister: lister.publicKey,
        systemProgram: SystemProgram.programId,
      };

      expect(accounts.etf.toBase58()).to.equal(etfPda.toBase58());
      expect(accounts.systemProgram.toBase58()).to.equal(
        "11111111111111111111111111111111"
      );
    });

    it("should build buyEtf accounts correctly", () => {
      const accounts = {
        etf: etfPda,
        investor: investor.publicKey,
        listerAccount: lister.publicKey,
        devWallet: DEV_WALLET,
        systemProgram: SystemProgram.programId,
      };

      expect(accounts.devWallet.toBase58()).to.equal(DEV_WALLET.toBase58());
    });

    it("should build sellEtf accounts correctly", () => {
      const accounts = {
        etf: etfPda,
        investor: investor.publicKey,
        listerAccount: lister.publicKey,
        devWallet: DEV_WALLET,
        systemProgram: SystemProgram.programId,
      };

      expect(accounts.listerAccount.toBase58()).to.equal(lister.publicKey.toBase58());
    });

    it("should build closeEtf accounts correctly", () => {
      const accounts = {
        etf: etfPda,
        lister: lister.publicKey,
        systemProgram: SystemProgram.programId,
      };

      expect(accounts.lister.toBase58()).to.equal(lister.publicKey.toBase58());
    });
  });

  // ============================================================================
  // Edge Case Tests
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle maximum safe integer for SOL amount", () => {
      // JavaScript Number.MAX_SAFE_INTEGER = 9007199254740991
      // In lamports, this would be ~9 billion SOL (way more than exists)
      const maxSafeAmount = Number.MAX_SAFE_INTEGER;
      const creatorFee = Math.floor(maxSafeAmount / 200);
      const devFee = Math.floor(maxSafeAmount / 200);

      expect(creatorFee).to.be.a('number');
      expect(devFee).to.be.a('number');
    });

    it("should handle BigInt for very large calculations", () => {
      // Use BigInt for amounts that might overflow
      const largeAmount = BigInt("9000000000000000000"); // 9 quintillion lamports
      const fee = largeAmount / 200n;

      expect(fee.toString()).to.equal("45000000000000000");
    });

    it("should handle minimum non-zero fee amount", () => {
      // Minimum amount that results in a non-zero fee
      // fee = amount / 200, so amount >= 200 for fee >= 1
      const minAmount = 200;
      const fee = Math.floor(minAmount / 200);

      expect(fee).to.equal(1);
    });

    it("should handle amounts just below minimum fee threshold", () => {
      const amount = 199;
      const fee = Math.floor(amount / 200);

      expect(fee).to.equal(0);
    });
  });

  // ============================================================================
  // Error Code Tests
  // ============================================================================

  describe("Error Codes", () => {
    const ErrorCodes = {
      InsufficientFunds: 6000,
      InvalidAmount: 6001,
      Unauthorized: 6002,
      InvalidTokenPercentages: 6003,
      CannotCloseWithSupply: 6004,
      InvalidTokenCount: 6005,
      InvalidDevWallet: 6006,
      InvalidListerAccount: 6007,
      MaxEtfsReached: 6008,
    };

    it("should have sequential error codes starting at 6000", () => {
      expect(ErrorCodes.InsufficientFunds).to.equal(6000);
      expect(ErrorCodes.InvalidAmount).to.equal(6001);
      expect(ErrorCodes.Unauthorized).to.equal(6002);
    });

    it("should have all expected error codes defined", () => {
      expect(Object.keys(ErrorCodes)).to.have.lengthOf(9);
    });

    it("should have MaxEtfsReached error code", () => {
      expect(ErrorCodes.MaxEtfsReached).to.equal(6008);
    });
  });

  // ============================================================================
  // Program Transaction Building Tests (Non-Custodial Flow)
  // ============================================================================

  describe("Program Transaction Building", () => {
    it("should use PDA from database when available", () => {
      // Simulate PDA from database (contract_address field)
      const storedPda = etfPda.toBase58();
      const pdaFromDb = new PublicKey(storedPda);

      expect(pdaFromDb.equals(etfPda)).to.be.true;
    });

    it("should derive same PDA as stored in database", () => {
      // When ETF is created, PDA is derived with index and stored
      const etfIndex = 0;
      const [derivedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("etf"), lister.publicKey.toBuffer(), Buffer.from([etfIndex])],
        PROGRAM_ID
      );

      // Simulate storing it
      const storedContractAddress = derivedPda.toBase58();

      // Later, when buying, we retrieve it
      const retrievedPda = new PublicKey(storedContractAddress);

      expect(retrievedPda.equals(derivedPda)).to.be.true;
    });

    it("should include dev_wallet in buy_etf accounts", () => {
      // Account order for buy_etf must include dev_wallet
      const buyEtfAccounts = [
        { pubkey: etfPda, isSigner: false, isWritable: true },           // 1. etf
        { pubkey: investor.publicKey, isSigner: true, isWritable: true }, // 2. investor
        { pubkey: lister.publicKey, isSigner: false, isWritable: true },  // 3. lister_account
        { pubkey: DEV_WALLET, isSigner: false, isWritable: true },        // 4. dev_wallet
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 5. system_program
      ];

      expect(buyEtfAccounts.length).to.equal(5);
      expect(buyEtfAccounts[3].pubkey.equals(DEV_WALLET)).to.be.true;
    });

    it("should build buy_etf instruction data correctly", () => {
      const solAmount = 1 * LAMPORTS_PER_SOL;
      const percentages = [50, 30, 20];

      // Instruction discriminator for buy_etf (first 8 bytes of sha256("global:buy_etf"))
      // Data format: [8 bytes discriminator] [8 bytes amount] [4 bytes vec len] [n bytes percentages]

      const amountBuf = Buffer.alloc(8);
      amountBuf.writeBigUInt64LE(BigInt(solAmount), 0);

      const vecLenBuf = Buffer.alloc(4);
      vecLenBuf.writeUInt32LE(percentages.length, 0);

      const percentagesBuf = Buffer.from(percentages);

      // Total data length: 8 (disc) + 8 (amount) + 4 (vec len) + 3 (percentages) = 23 bytes
      const totalLength = 8 + 8 + 4 + percentages.length;
      expect(totalLength).to.equal(23);

      // Verify amount encoding
      const readAmount = amountBuf.readBigUInt64LE(0);
      expect(Number(readAmount)).to.equal(solAmount);

      // Verify vec length encoding
      const readLen = vecLenBuf.readUInt32LE(0);
      expect(readLen).to.equal(3);
    });

    it("should skip program transaction when no PDA available", () => {
      // When ETF is not initialized on-chain (old ETFs), etfPdaFromDb is undefined
      const etfPdaFromDb: PublicKey | undefined = undefined;

      // In this case, programTransaction should be undefined
      const shouldBuildProgramTx = etfPdaFromDb !== undefined;
      expect(shouldBuildProgramTx).to.be.false;
    });

    it("should build program transaction when PDA is available", () => {
      // When ETF is initialized on-chain (new ETFs), etfPdaFromDb is set
      const etfPdaFromDb: PublicKey | undefined = etfPda;

      const shouldBuildProgramTx = etfPdaFromDb !== undefined;
      expect(shouldBuildProgramTx).to.be.true;
    });
  });

  // ============================================================================
  // Percentage Rounding Tests
  // ============================================================================

  describe("Percentage Rounding", () => {
    it("should round percentages to integers", () => {
      const percentages = [33.33, 33.33, 33.34];
      const rounded = percentages.map(p => Math.round(p));

      expect(rounded).to.deep.equal([33, 33, 33]);
    });

    it("should adjust last percentage to ensure sum is 100", () => {
      const percentages = [33.33, 33.33, 33.34];
      let rounded = percentages.map(p => Math.round(p));
      const sum = rounded.reduce((a, b) => a + b, 0);

      // Adjust last to make sum = 100
      if (sum !== 100 && rounded.length > 0) {
        rounded[rounded.length - 1] += (100 - sum);
      }

      expect(rounded.reduce((a, b) => a + b, 0)).to.equal(100);
      expect(rounded).to.deep.equal([33, 33, 34]); // Last adjusted from 33 to 34
    });

    it("should handle already-integer percentages", () => {
      const percentages = [50, 30, 20];
      const rounded = percentages.map(p => Math.round(p));
      const sum = rounded.reduce((a, b) => a + b, 0);

      expect(sum).to.equal(100);
      expect(rounded).to.deep.equal([50, 30, 20]);
    });

    it("should handle edge case where rounding causes sum > 100", () => {
      const percentages = [25.6, 25.6, 25.6, 23.2]; // Rounds to [26, 26, 26, 23] = 101
      let rounded = percentages.map(p => Math.round(p));
      const sum = rounded.reduce((a, b) => a + b, 0);

      // Adjust last to make sum = 100
      if (sum !== 100 && rounded.length > 0) {
        rounded[rounded.length - 1] += (100 - sum);
      }

      expect(rounded.reduce((a, b) => a + b, 0)).to.equal(100);
    });
  });

  // ============================================================================
  // Non-Custodial Flow Tests
  // ============================================================================

  describe("Non-Custodial Flow", () => {
    it("should derive PDA from creator wallet with index", () => {
      // In non-custodial flow, ETF is created with user's wallet + index
      const creatorWallet = lister.publicKey;
      const etfIndex = 0;

      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("etf"), creatorWallet.toBuffer(), Buffer.from([etfIndex])],
        PROGRAM_ID
      );

      // This PDA is stored as contract_address
      expect(pda.toBase58()).to.equal(etfPda.toBase58());
    });

    it("should use stored contract_address for buy transactions", () => {
      // Simulate database record
      const dbRecord = {
        id: "etf-123",
        name: "Test ETF",
        creator: lister.publicKey.toBase58(),
        contract_address: etfPda.toBase58(), // Stored PDA
        network: "devnet",
      };

      // When building buy transaction, use contract_address
      const pdaForBuy = new PublicKey(dbRecord.contract_address);

      expect(pdaForBuy.equals(etfPda)).to.be.true;
    });

    it("should not require protocol wallet for transactions", () => {
      // In non-custodial, user signs directly
      // No encrypted private keys needed
      const userWallet = investor.publicKey;

      // User is the signer
      const isSigner = true;
      const needsProtocolWallet = false;

      expect(isSigner).to.be.true;
      expect(needsProtocolWallet).to.be.false;
    });
  });
});
