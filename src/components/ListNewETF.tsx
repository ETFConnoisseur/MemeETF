import { useState } from 'react';
import { Plus, X, Loader2, MessageCircle } from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { apiPost } from '../lib/api';
import { useToastContext } from '../contexts/ToastContext';
import { useNetwork } from '../contexts/NetworkContext';

// Format market cap with appropriate suffix (K, M, B)
function formatMarketCap(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

interface TokenAllocation {
  id: string;
  address: string;
  symbol: string;
  name: string;
  image: string;
  marketCap: number;
  percentage: number;
  loading?: boolean;
  note?: string;
}

interface ListNewETFProps {
  onNavigate: (tab: string, data?: any) => void;
}

export function ListNewETF({ onNavigate }: ListNewETFProps) {
  const { publicKey, connected, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { addToast, updateToast } = useToastContext();
  const { network } = useNetwork();
  const [currentStep, setCurrentStep] = useState('');
  const [etfName, setEtfName] = useState('');
  const [tweetLink, setTweetLink] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [tokenAllocations, setTokenAllocations] = useState<TokenAllocation[]>([
    { id: '1', address: '', symbol: '', name: '', image: '', marketCap: 0, percentage: 33.33 },
    { id: '2', address: '', symbol: '', name: '', image: '', marketCap: 0, percentage: 33.33 },
    { id: '3', address: '', symbol: '', name: '', image: '', marketCap: 0, percentage: 33.34 },
  ]);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');

  const fetchTokenInfo = async (address: string, tokenId: string) => {
    if (!address.trim()) return;

    // Set loading state
    setTokenAllocations(prev => prev.map(t => 
      t.id === tokenId ? { ...t, loading: true } : t
    ));

    try {
      // Try DexScreener first
      console.log('Fetching token info from DexScreener for:', address);
      const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        const pair = dexData.pairs?.[0];
        
        if (pair) {
          console.log('DexScreener data found:', pair.baseToken?.name);
          // Try multiple image sources from DexScreener response
          let tokenImage = pair.info?.imageUrl || '';
          if (!tokenImage && pair.info?.websites?.[0]?.url) {
            // Some tokens have image in different place
          }
          // Fallback to Jupiter CDN if no image from DexScreener
          if (!tokenImage) {
            tokenImage = `https://tokens.jup.ag/token/${address}/logo`;
          }
          
          // Get market cap - prefer marketCap, fallback to fdv
          const marketCap = pair.marketCap 
            ? parseFloat(pair.marketCap) 
            : (pair.fdv ? parseFloat(pair.fdv) : 0);
          
          console.log(`[Token ${tokenId}] Market Cap from DexScreener:`, marketCap, 'for', pair.baseToken?.symbol);
          
          setTokenAllocations(prev => prev.map(t => 
            t.id === tokenId ? {
              ...t,
              symbol: pair.baseToken?.symbol || 'UNKNOWN',
              name: pair.baseToken?.name || 'Unknown Token',
              image: tokenImage,
              marketCap: marketCap,
              loading: false,
            } : t
          ));
          return;
        }
      }
      
      // Fallback to Solscan
      console.log('DexScreener failed, trying Solscan for:', address);
      const solscanMetaResponse = await fetch(`https://api.solscan.io/v2/token/meta?address=${address}`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (solscanMetaResponse.ok) {
        const solscanMeta = await solscanMetaResponse.json();
        
        // Try to get market data
        let marketCap = 0;
        try {
          const solscanMarketResponse = await fetch(`https://api.solscan.io/v2/token/price?address=${address}`, {
            headers: { 'Accept': 'application/json' }
          });
          if (solscanMarketResponse.ok) {
            const solscanMarket = await solscanMarketResponse.json();
            marketCap = parseFloat(solscanMarket.data?.marketCap || '0');
          }
        } catch (e) {
          console.warn('Failed to fetch Solscan market data:', e);
        }
        
        if (solscanMeta.data) {
          console.log('Solscan data found:', solscanMeta.data.name);
          setTokenAllocations(prev => prev.map(t => 
            t.id === tokenId ? {
              ...t,
              symbol: solscanMeta.data?.symbol || 'UNKNOWN',
              name: solscanMeta.data?.name || 'Unknown Token',
              image: solscanMeta.data?.icon || '',
              marketCap: marketCap,
              loading: false,
            } : t
          ));
          return;
        }
      }
      
      // Final fallback to Jupiter
      console.log('Solscan failed, trying Jupiter for:', address);
      try {
        const jupiterPriceResponse = await fetch(`https://price.jup.ag/v6/price?ids=${address}`);
        if (!jupiterPriceResponse.ok) {
          throw new Error('Jupiter price API failed');
        }
        const jupiterPriceData = await jupiterPriceResponse.json();

        const jupiterMetaResponse = await fetch(`https://tokens.jup.ag/token/${address}`);
        if (!jupiterMetaResponse.ok) {
          throw new Error('Jupiter metadata API failed');
        }
        const jupiterMeta = await jupiterMetaResponse.json();

        console.log('Jupiter data found:', jupiterMeta.name);
        const price = jupiterPriceData.data?.[address]?.price || 0;
        const supply = jupiterMeta.supply || 0;

        setTokenAllocations(prev => prev.map(t =>
          t.id === tokenId ? {
            ...t,
            symbol: jupiterMeta.symbol || 'UNKNOWN',
            name: jupiterMeta.name || 'Unknown Token',
            image: jupiterMeta.logoURI || '',
            marketCap: price * supply,
            loading: false,
          } : t
        ));
      } catch (jupiterError) {
        console.warn('Jupiter API failed:', jupiterError);
        // If all APIs fail, set loading to false so user knows it failed
        setTokenAllocations(prev => prev.map(t =>
          t.id === tokenId ? { ...t, loading: false } : t
        ));
      }
    } catch (error) {
      console.error('Failed to fetch token info from all sources:', error);
      setTokenAllocations(prev => prev.map(t => 
        t.id === tokenId ? { ...t, loading: false } : t
      ));
    }
  };

  const addToken = () => {
    const newPercentage = 100 / (tokenAllocations.length + 1);
    const updatedAllocations = tokenAllocations.map(token => ({
      ...token,
      percentage: newPercentage,
    }));
    setTokenAllocations([
      ...updatedAllocations,
      { id: Date.now().toString(), address: '', symbol: '', name: '', image: '', marketCap: 0, percentage: newPercentage },
    ]);
  };

  const removeToken = (id: string) => {
    if (tokenAllocations.length > 1) {
      const filtered = tokenAllocations.filter((token) => token.id !== id);
      const newPercentage = 100 / filtered.length;
      setTokenAllocations(filtered.map(token => ({ ...token, percentage: newPercentage })));
    }
  };

  const updateTokenAddress = async (id: string, address: string) => {
    setTokenAllocations(
      tokenAllocations.map((token) =>
        token.id === id ? { ...token, address } : token
      )
    );

    // Fetch token info after address is set
    if (address.trim().length >= 32) { // Solana addresses are typically 32-44 chars
      await fetchTokenInfo(address, id);
    }
  };

  const updateTokenPercentage = (id: string, percentage: number) => {
    setTokenAllocations(
      tokenAllocations.map((token) =>
        token.id === id ? { ...token, percentage } : token
      )
    );
  };

  const updateTokenNote = (id: string, note: string) => {
    setTokenAllocations(
      tokenAllocations.map((token) =>
        token.id === id ? { ...token, note } : token
      )
    );
  };

  const toggleNote = (id: string) => {
    setExpandedNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const validateForm = (): boolean => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return false;
    }
    if (!etfName.trim()) {
      setError('Please enter an ETF name');
      return false;
    }
    if (tokenAllocations.some(t => !t.address.trim())) {
      setError('Please fill in all token addresses');
      return false;
    }
    const totalPercentage = tokenAllocations.reduce((sum, t) => sum + t.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      setError('Token percentages must add up to 100%');
      return false;
    }
    return true;
  };

  const handleDeploy = async () => {
    setError('');
    setCurrentStep('');
    if (!validateForm()) return;

    if (!signTransaction) {
      setError('Wallet does not support transaction signing');
      return;
    }

    try {
      setDeploying(true);

      // Filter out tokens without valid data
      const validTokens = tokenAllocations.filter(t =>
        t.address &&
        t.marketCap > 0 &&
        !isNaN(t.marketCap) &&
        isFinite(t.marketCap)
      );

      if (validTokens.length === 0) {
        setError('Please add at least one token with valid market cap data');
        setDeploying(false);
        return;
      }

      console.log('[ListNewETF] Token data:', validTokens.map(t => ({
        symbol: t.symbol,
        marketCap: t.marketCap,
        weight: t.percentage
      })));

      // Show pending toast
      const toastId = addToast({
        type: 'etf_create',
        status: 'pending',
        message: `Preparing ETF "${etfName}"...`,
        network: network === 'mainnet-beta' ? 'mainnet' : 'devnet',
      });

      // Step 1: Prepare unsigned transaction
      setCurrentStep('Preparing transaction...');
      const prepareResponse = await apiPost<{
        success: boolean;
        error?: string;
        transaction?: string;
        etfPda?: string;
        etfIndex?: number;
      }>('/api/etfs/prepare', {
        name: etfName,
        userWallet: publicKey!.toBase58(),
        network: network,
        tokens: validTokens.map(t => ({
          address: t.address,
          symbol: t.symbol || 'UNKNOWN',
          name: t.name || 'Unknown Token',
          market_cap: t.marketCap,
          weight: t.percentage,
          image: t.image || '',
        })),
      });

      if (!prepareResponse.success || !prepareResponse.transaction) {
        updateToast(toastId, {
          status: 'error',
          message: prepareResponse.error || 'Failed to prepare transaction',
        });
        setError(prepareResponse.error || 'Failed to prepare transaction');
        return;
      }

      // Step 2: Sign with wallet
      setCurrentStep('Please sign the transaction in your wallet...');
      updateToast(toastId, {
        status: 'pending',
        message: 'Sign the transaction in your wallet...',
      });

      const tx = Transaction.from(Buffer.from(prepareResponse.transaction, 'base64'));
      const signedTx = await signTransaction(tx);

      // Step 3: Send transaction
      setCurrentStep('Sending transaction...');
      updateToast(toastId, {
        status: 'pending',
        message: 'Sending transaction to Solana...',
      });

      const txSignature = await connection.sendRawTransaction(signedTx.serialize());

      // Wait for confirmation
      setCurrentStep('Confirming transaction...');
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction({
        signature: txSignature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      // Step 4: Confirm with backend (save to database)
      setCurrentStep('Registering ETF...');
      const confirmResponse = await apiPost<{
        success: boolean;
        error?: string;
        etf?: any;
        explorerUrl?: string;
      }>('/api/etfs/confirm', {
        name: etfName,
        userWallet: publicKey!.toBase58(),
        txSignature,
        network: network,
        tweetUrl: tweetLink || undefined,
        etfIndex: prepareResponse.etfIndex,
        tokens: validTokens.map(t => ({
          address: t.address,
          symbol: t.symbol || 'UNKNOWN',
          name: t.name || 'Unknown Token',
          market_cap: t.marketCap,
          weight: t.percentage,
          image: t.image || '',
        })),
      });

      if (confirmResponse.success && confirmResponse.etf) {
        updateToast(toastId, {
          status: 'success',
          message: `Successfully created ETF "${etfName}"!`,
          txSignature: txSignature,
        });
        setCurrentStep('');
        onNavigate('dashboard');
      } else {
        // Transaction succeeded but database save failed - still show success
        updateToast(toastId, {
          status: 'success',
          message: `ETF created on-chain! ${confirmResponse.error || ''}`,
          txSignature: txSignature,
        });
        setCurrentStep('');
        onNavigate('dashboard');
      }
    } catch (err: any) {
      console.error('Error deploying ETF:', err);
      const errorMessage = err?.message || err?.data?.error || 'Failed to deploy ETF. Please try again.';
      setError(errorMessage);
      setCurrentStep('');
    } finally {
      setDeploying(false);
    }
  };

  const totalPercentage = tokenAllocations.reduce((sum, t) => sum + t.percentage, 0);
  const isValid = connected && etfName.trim() && tokenAllocations.every(t => t.address.trim()) && Math.abs(totalPercentage - 100) < 0.01;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl space-y-8">
        {/* Title */}
        <h1 className="text-5xl text-center tracking-tight">List New ETF</h1>

        {!connected && (
          <div className="rounded-2xl border border-yellow-500/50 backdrop-blur-sm p-6 text-center">
            <p className="text-yellow-200">Please connect your wallet to create an ETF</p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border-2 border-red-500 backdrop-blur-sm p-6 text-center">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* ETF Name Section */}
        <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20">
          <label className="block mb-4">ETF Name</label>
          <input
            type="text"
            value={etfName}
            onChange={(e) => setEtfName(e.target.value)}
            placeholder="My Custom Token ETF"
            className="w-full px-6 py-4 rounded-xl border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
          />

          <label className="block mb-4 mt-6">Tweet Link (optional)</label>
          <input
            type="text"
            value={tweetLink}
            onChange={(e) => setTweetLink(e.target.value)}
            placeholder="https://x.com/yourhandle/status/..."
            className="w-full px-6 py-4 rounded-xl border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
          />
          <p className="text-xs text-white/60 mt-2">Share a tweet showing your conviction for this ETF</p>
        </div>

        {/* Token Contract Addresses Section */}
        <div className="rounded-2xl border border-white/10 backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20">
          <div className="text-center mb-8">
            <h2 className="text-3xl mb-3">Token Allocations</h2>
            <p className="text-white">
              Add tokens and their percentage allocations (must total 100%)
            </p>
            <p className={`text-sm mt-2 ${Math.abs(totalPercentage - 100) < 0.01 ? 'text-emerald-400' : 'text-red-400'}`}>
              Total: {totalPercentage.toFixed(2)}%
            </p>
          </div>

          <div className="space-y-4 mb-6">
            {tokenAllocations.map((token) => (
              <div key={token.id} className="rounded-xl border border-white/10 p-4">
                <div className="flex items-center gap-4 mb-3">
                  <input
                    type="text"
                    value={token.address}
                    onChange={(e) => updateTokenAddress(token.id, e.target.value)}
                    placeholder="Token contract address..."
                    className="flex-1 px-4 py-3 rounded-lg border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm"
                  />
                  <input
                    type="number"
                    value={token.percentage}
                    onChange={(e) => updateTokenPercentage(token.id, parseFloat(e.target.value) || 0)}
                    placeholder="50"
                    className="w-20 px-3 py-3 rounded-lg border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm text-center"
                  />
                  <span className="text-white/60 text-sm">%</span>
                  <button
                    onClick={() => removeToken(token.id)}
                    disabled={tokenAllocations.length === 1}
                    className="px-4 py-3 rounded-lg bg-transparent border border-white/20 text-white hover:bg-white/5 hover:border-white/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Remove
                  </button>
                </div>

                {/* Token Info Display */}
                {token.loading ? (
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Fetching token info...</span>
                  </div>
                ) : token.name ? (
                  <div className="pt-3 border-t border-white/10">
                    <div className="flex items-center gap-4">
                      {token.image && (
                        <img src={token.image} alt={token.symbol} className="w-8 h-8 rounded-full" />
                      )}
                      <div className="flex-1 flex items-center gap-2">
                        <div>
                          <p className="text-white font-medium">{token.name}</p>
                          <p className="text-white text-sm">{token.symbol}</p>
                        </div>
                        <button
                          onClick={() => toggleNote(token.id)}
                          className={`p-1.5 rounded-lg transition-all ${expandedNotes.has(token.id) ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60 hover:bg-white/5'}`}
                          title="Add note about why you added this token"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      </div>
                      {token.marketCap > 0 && (
                        <div className="text-right">
                          <p className="text-white text-xs">Market Cap</p>
                          <p className="text-white font-medium">{formatMarketCap(token.marketCap)}</p>
                        </div>
                      )}
                    </div>
                    {expandedNotes.has(token.id) && (
                      <div className="mt-3">
                        <textarea
                          value={token.note || ''}
                          onChange={(e) => updateTokenNote(token.id, e.target.value)}
                          placeholder="Why did you add this token to your ETF?"
                          className="w-full px-4 py-3 rounded-lg border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-sm resize-none"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                ) : token.address && !token.loading ? (
                  <p className="text-red-400 text-sm pt-3 border-t border-white/10">Failed to fetch token info</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              onClick={addToken}
              className="px-8 py-3 rounded-xl border border-white/20 text-white hover:bg-white/5 hover:border-white/30 transition-all duration-300 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Token
            </button>
          </div>
        </div>

        {/* Summary & Fee Section */}
        {tokenAllocations.some(t => t.address && t.marketCap > 0) && (
          <div className="rounded-2xl border-2 border-emerald-500 backdrop-blur-sm p-6 space-y-4">
            <h3 className="text-lg font-medium text-emerald-400">ETF Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-white/10 p-4">
                <p className="text-xs text-white mb-1">Total Market Cap</p>
                <p className="text-xl text-white">
                  {(() => {
                    const validTokens = tokenAllocations.filter(t => t.address && t.marketCap > 0);
                    const totalMC = validTokens.reduce((sum, t) => {
                      const weighted = t.marketCap * (t.percentage / 100);
                      console.log(`[Total MC Calc] ${t.symbol}: $${t.marketCap.toLocaleString()} × ${t.percentage}% = $${weighted.toLocaleString()}`);
                      return sum + weighted;
                    }, 0);
                    console.log(`[Total MC Calc] Final Total: $${totalMC.toLocaleString()}`);
                    return formatMarketCap(totalMC);
                  })()}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 p-4">
                <p className="text-xs text-white mb-1">Tokens Included</p>
                <p className="text-xl text-white">{tokenAllocations.filter(t => t.address).length}</p>
              </div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">Deployment Fee</p>
                  <p className="text-xs text-white/60">Required to deploy smart contract on Solana</p>
                </div>
                <div className="text-right">
                  <p className="text-lg text-white font-medium">0.01 SOL</p>
                  <p className="text-xs text-white/60">~$2.00</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Progress Indicator */}
        {deploying && currentStep && (
          <div className="rounded-2xl bg-black border border-white/10 backdrop-blur-sm p-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-white/60" />
              <span className="text-white/80">{currentStep}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-6">
          <button
            onClick={() => onNavigate('dashboard')}
            disabled={deploying}
            className="py-4 rounded-xl border border-white/20 text-white hover:bg-white/5 hover:border-white/30 transition-all duration-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            disabled={!isValid || deploying}
            className={`py-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
              isValid && !deploying
                ? 'bg-transparent border-2 border-emerald-500 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400'
                : 'bg-transparent text-white/40 border border-white/30 cursor-not-allowed'
            }`}
          >
            {deploying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {currentStep ? 'Processing...' : 'Deploying...'}
              </>
            ) : (
              'Deploy ETF'
            )}
          </button>
        </div>

        <p className="text-xs text-white/60 text-center">
          You sign the transaction directly with your wallet. No private keys stored.
        </p>
      </div>
    </div>
  );
}
