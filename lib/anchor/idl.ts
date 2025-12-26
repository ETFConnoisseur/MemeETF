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
        "Fees: 0.5% to ETF creator, 0.5% to dev wallet (automatic transfer).",
        "Remaining SOL is used for token swaps via backend."
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
          "name": "listerAccount",
          "isMut": true,
          "isSigner": false,
          "docs": ["ETF creator's account for receiving 0.5% fee"]
        },
        {
          "name": "devWallet",
          "isMut": true,
          "isSigner": false,
          "docs": ["Dev wallet for receiving 0.5% fee (hardcoded in contract)"]
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
        },
        {
          "name": "tokenPercentages",
          "type": {
            "vec": "u8"
          }
        }
      ]
    },
    {
      "name": "sellEtf",
      "docs": [
        "Sell ETF tokens back for SOL.",
        "Fees: 0.5% to ETF creator, 0.5% to dev wallet (automatic transfer).",
        "Remaining SOL is returned to the investor."
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
          "name": "listerAccount",
          "isMut": true,
          "isSigner": false,
          "docs": ["ETF creator's account for receiving 0.5% fee"]
        },
        {
          "name": "devWallet",
          "isMut": true,
          "isSigner": false,
          "docs": ["Dev wallet for receiving 0.5% fee (hardcoded in contract)"]
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
      "name": "closeEtf",
      "docs": [
        "Close an ETF and reclaim rent.",
        "Only the lister can close, and only if total_supply is 0."
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
    },
    {
      "code": 6003,
      "name": "InvalidTokenPercentages",
      "msg": "Invalid token percentages - must sum to 100"
    },
    {
      "code": 6004,
      "name": "CannotCloseWithSupply",
      "msg": "Cannot close ETF with outstanding supply"
    },
    {
      "code": 6005,
      "name": "InvalidTokenCount",
      "msg": "Invalid token count - must be between 1 and 10"
    },
    {
      "code": 6006,
      "name": "InvalidDevWallet",
      "msg": "Invalid dev wallet address"
    },
    {
      "code": 6007,
      "name": "InvalidListerAccount",
      "msg": "Invalid lister account - must match ETF creator"
    }
  ],
  "metadata": {
    "address": "CwwrCDfrsuA2C4YPiobU82ZA9wSWrecyLbbvP35QXmyo"
  }
};
