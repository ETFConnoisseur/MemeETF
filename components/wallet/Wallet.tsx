'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { Spinner } from '@/components/ui/spinner-1';

// Mock Protocol Vault Address for demo purposes (replace with real PDA/Vault)
const PROTOCOL_VAULT_ADDRESS = '11111111111111111111111111111111';

export default function Wallet({ balance: initialSiteBalance = 0, userId = 'mock-user-id' }: { balance?: number; userId?: string }) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  
  const [isOpen, setIsOpen] = useState(false);
  const [browserBalance, setBrowserBalance] = useState<number>(0);
  const [siteBalance, setSiteBalance] = useState<number>(initialSiteBalance);
  
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [depositShake, setDepositShake] = useState(false);
  const [withdrawShake, setWithdrawShake] = useState(false);

  const createPasteHandler = (setter: (val: string) => void, setShake: (val: boolean) => void) => (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    
    // Validate: Numbers only, max 9 decimals
    if (/^\d+(\.\d{0,9})?$/.test(pastedText)) {
      setIsPasting(true);
      setTimeout(() => setIsPasting(false), 300);
      setter(pastedText);
      e.preventDefault(); 
    } else {
      e.preventDefault();
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  // Fetch Browser Wallet Balance
  const fetchBrowserBalance = useCallback(async () => {
    if (publicKey && connection) {
      setLoadingBalance(true);
      try {
        const bal = await connection.getBalance(publicKey);
        setBrowserBalance(bal / LAMPORTS_PER_SOL);
      } catch (err) {
        console.error("Error fetching balance:", err);
      } finally {
        setLoadingBalance(false);
      }
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (connected) {
      fetchBrowserBalance();
      // In a real app, fetchSiteBalance() here too
    }
  }, [connected, fetchBrowserBalance]);

  // Handle Wallet Button Click
  const handleWalletClick = () => {
    if (!connected) {
      setVisible(true);
    } else {
      setIsOpen(!isOpen);
    }
  };

  const handleDeposit = async () => {
    if (!publicKey || !depositAmount) return;
    
    setDepositing(true);
    try {
      const amount = parseFloat(depositAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Invalid amount");

      // In a real app, you'd deposit to a PDA or Vault. 
      // Here we just simulate a transfer to a dummy address or self for demo.
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey, // Sending to self for demo safety, or use PROTOCOL_VAULT_ADDRESS
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Update UI state
      alert('Deposit successful!');
      setDepositAmount('');
      await fetchBrowserBalance();
      setSiteBalance(prev => prev + amount); // Mock update site balance
    } catch (error) {
      console.error('Error depositing:', error);
      alert('Failed to deposit');
    } finally {
      setDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) {
      alert('Please enter amount');
      return;
    }

    setWithdrawing(true);
    try {
      const amount = parseFloat(withdrawAmount);
      if (amount > siteBalance) {
        alert('Insufficient site balance');
        return;
      }

      // Call API to withdraw
      const response = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: publicKey?.toBase58(), // Withdraw to connected wallet
          amount: amount,
          userId: userId,
        }),
      });

      if (response.ok) {
        alert('Withdrawal initiated');
        setWithdrawAmount('');
        setSiteBalance(prev => prev - amount); // Mock update
        // Poll for browser balance update or wait
        setTimeout(fetchBrowserBalance, 2000);
      } else {
        alert('Withdrawal initiated (Mock)');
        setWithdrawAmount('');
        setSiteBalance(prev => prev - amount);
      }
    } catch (error) {
      console.error('Error withdrawing:', error);
      alert('Failed to withdraw');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="relative">
      <Button
        type="secondary"
        size="medium"
        onClick={handleWalletClick}
        className="mr-2"
      >
        {connected ? (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
            {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
          </span>
        ) : (
          "Connect Wallet"
        )}
      </Button>

      {isOpen && connected && (
        <div className="absolute right-0 top-full mt-2 w-96 z-50">
          <Card className="p-8">
            <div className="space-y-6">
              <div className="text-center border-b border-bg-secondary pb-4">
                <h3 className="text-sm font-semibold text-text-primary/70 mb-1">Wallet Balance</h3>
                <p className="text-3xl font-bold text-text-primary">
                  {loadingBalance ? <Spinner size={24} /> : `${browserBalance.toFixed(4)} SOL`}
                </p>
              </div>

              <div className="text-center pb-2">
                <h3 className="text-sm font-semibold text-text-primary/70 mb-1">Protocol Balance</h3>
                <p className="text-2xl font-bold text-accent-primary">
                  {siteBalance.toFixed(4)} SOL
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-text-primary/70 block mb-1">Deposit Amount (SOL)</label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        placeholder="0.00"
                        value={depositAmount}
                        onPaste={createPasteHandler(setDepositAmount, setDepositShake)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setDepositAmount(val);
                          }
                        }}
                        className={`text-center font-mono text-lg ${isPasting ? 'paste-highlight' : ''} ${depositShake ? 'shake-animation' : ''}`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-primary/50 pointer-events-none">
                        SOL
                      </span>
                    </div>
                    <div className="text-xs font-mono text-text-primary whitespace-nowrap flex flex-col items-end min-w-[80px]">
                      <span className="text-text-primary/50 text-[10px] uppercase">Wallet Bal</span>
                      <span>{browserBalance.toFixed(4)}</span>
                    </div>
                  </div>
                  <Button
                    type="primary"
                    size="medium"
                    fullWidth
                    onClick={handleDeposit}
                    loading={depositing}
                    disabled={!depositAmount}
                    className="mt-2"
                  >
                    Deposit to Protocol
                  </Button>
                </div>

                <div className="space-y-2 pt-4 border-t border-bg-secondary">
                  <label className="text-xs text-text-primary/70 block mb-1">Withdraw Amount (SOL)</label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]*"
                        placeholder="0.00"
                        value={withdrawAmount}
                        onPaste={createPasteHandler(setWithdrawAmount, setWithdrawShake)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setWithdrawAmount(val);
                          }
                        }}
                        className={`text-center font-mono text-lg ${isPasting ? 'paste-highlight' : ''} ${withdrawShake ? 'shake-animation' : ''}`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-primary/50 pointer-events-none">
                        SOL
                      </span>
                    </div>
                    <div className="text-xs font-mono text-accent-primary whitespace-nowrap flex flex-col items-end min-w-[80px]">
                      <span className="text-text-primary/50 text-[10px] uppercase">Current Bal</span>
                      <span className="animate-pulse">{siteBalance.toFixed(4)}</span>
                    </div>
                  </div>
                  <Button
                    type="secondary"
                    size="medium"
                    fullWidth
                    onClick={handleWithdraw}
                    loading={withdrawing}
                    disabled={!withdrawAmount}
                    className="mt-2"
                  >
                    Withdraw to Wallet
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
