#!/bin/bash
# Deploy MTF ETF Smart Contract to Devnet

echo "========================================"
echo "Deploying MTF ETF to Devnet"
echo "========================================"
echo ""

# Check if program exists
if [ ! -f "target/deploy/mtf_etf.so" ]; then
    echo "❌ Program binary not found at target/deploy/mtf_etf.so"
    echo "Please build the program first with: anchor build"
    exit 1
fi

echo "✅ Program binary found"
echo ""

# Check wallet balance
echo "Checking wallet balance..."
BALANCE=$(solana balance --url devnet 2>&1 | grep -oP '\d+\.\d+' | head -1)
echo "Current balance: $BALANCE SOL"
echo ""

# Check if we have enough SOL (need ~1.67 SOL)
if (( $(echo "$BALANCE < 1.7" | bc -l) )); then
    echo "⚠️  Balance may be insufficient. Requesting airdrop..."
    solana airdrop 2 --url devnet
    sleep 5
    BALANCE=$(solana balance --url devnet 2>&1 | grep -oP '\d+\.\d+' | head -1)
    echo "New balance: $BALANCE SOL"
    echo ""
fi

# Deploy the program
echo "Deploying program to devnet..."
echo "Program ID: $(solana address -k target/deploy/mtf_etf-keypair.json)"
echo ""

solana program deploy target/deploy/mtf_etf.so \
    --url devnet \
    --program-id target/deploy/mtf_etf-keypair.json \
    --keypair ~/.config/solana/id.json

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "✅ DEPLOYMENT SUCCESSFUL!"
    echo "========================================"
    echo ""
    PROGRAM_ID=$(solana address -k target/deploy/mtf_etf-keypair.json)
    echo "Program ID: $PROGRAM_ID"
    echo ""
    echo "Verify deployment:"
    echo "  solana program show $PROGRAM_ID --url devnet"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    exit 1
fi


