// MTF ETF Program IDL
// This IDL should match the deployed Anchor program on devnet

// Program ID - Deployed on Solana devnet
// To redeploy: cd programs/mtf-etf && anchor build && anchor deploy --provider.cluster devnet
export const PROGRAM_ID = 'CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo';

export const IDL = {
  "version": "0.1.0",
  "name": "mtf_etf",
  "instructions": [
    {
      "name": "initializeEtf",
      "docs": [
        "Initialize a new ETF with a list of token addresses.",
        "Each wallet can only create one ETF (PDA is derived from lister pubkey)."
      ],
      "accounts": [
        {
          "name": "etf",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "type": "string",
                "value": "etf"
              },
              {
                "kind": "account",
                "type": "publicKey",
                "account": "lister",
                "path": "lister"
              }
            ]
          }
        },
        {
          "name": "lister",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "tokenAddresses",
          "type": {
            "vec": "publicKey"
          }
        }
      ]
    },
    {
      "name": "buyEtf",
      "docs": [
        "Buy into an ETF by depositing SOL.",
        "SOL is transferred to the ETF vault, and ETF tokens are minted to the investor."
      ],
      "accounts": [
        {
          "name": "etf",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "investor",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "investorAta",
          "isMut": true,
          "isSigner": false,
          "docs": ["Investor's SOL account"]
        },
        {
          "name": "etfVault",
          "isMut": true,
          "isSigner": false,
          "docs": ["ETF's SOL vault"]
        },
        {
          "name": "listerAta",
          "isMut": true,
          "isSigner": false,
          "docs": ["Lister's account for receiving fees"]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "solAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "sellEtf",
      "docs": [
        "Sell ETF tokens back for SOL.",
        "ETF tokens are burned and SOL is returned to the investor."
      ],
      "accounts": [
        {
          "name": "etf",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "investor",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "investorAta",
          "isMut": true,
          "isSigner": false,
          "docs": ["Investor's SOL account"]
        },
        {
          "name": "etfVault",
          "isMut": true,
          "isSigner": false,
          "docs": ["ETF's SOL vault"]
        },
        {
          "name": "listerAta",
          "isMut": true,
          "isSigner": false,
          "docs": ["Lister's account for receiving fees"]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "tokensToSell",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimFees",
      "docs": [
        "Claim accumulated fees as the ETF lister."
      ],
      "accounts": [
        {
          "name": "etf",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "lister",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "listerAta",
          "isMut": true,
          "isSigner": false,
          "docs": ["Lister's account for receiving fees"]
        },
        {
          "name": "etfVault",
          "isMut": true,
          "isSigner": false,
          "docs": ["ETF's SOL vault"]
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "ETF",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lister",
            "type": "publicKey",
            "docs": ["The wallet that created this ETF"]
          },
          {
            "name": "tokenAddresses",
            "type": {
              "vec": "publicKey"
            },
            "docs": ["List of token contract addresses in this ETF"]
          },
          {
            "name": "totalSupply",
            "type": "u64",
            "docs": ["Total supply of ETF tokens minted"]
          },
          {
            "name": "bump",
            "type": "u8",
            "docs": ["PDA bump seed"]
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InsufficientFunds",
      "msg": "Insufficient funds for this operation"
    },
    {
      "code": 6001,
      "name": "InvalidAmount",
      "msg": "Invalid amount specified"
    },
    {
      "code": 6002,
      "name": "Unauthorized",
      "msg": "You are not authorized to perform this action"
    }
  ],
  "metadata": {
    "address": "CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo"
  }
};
