import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { WalletModal } from './WalletModal';
import { NetworkSwitch } from './NetworkSwitch';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string, data?: any) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const { connected, publicKey } = useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  return (
    <>
      <nav className="border-b border-white/10 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-12">
            <h1 className="text-xl tracking-tight">MTF</h1>
            
            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-1">
              {['Dashboard', 'List New ETF', 'Listings', 'Leaderboard', 'Portfolio', 'Rewards'].map((tab) => {
                const tabValue = tab.toLowerCase().replace(/ /g, '-');
                return (
                  <button
                    key={tab}
                    onClick={() => onTabChange(tabValue)}
                    className={`px-4 py-2 rounded-lg transition-all ${
                      activeTab === tabValue
                        ? 'text-white bg-white/10'
                        : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            <NetworkSwitch />
            {connected && publicKey ? (
              <>
                <button
                  onClick={() => setIsWalletModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 transition-all text-white font-medium shadow-lg hover:shadow-purple-500/50"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  <span className="text-sm">{truncateAddress(publicKey.toBase58())}</span>
                </button>
              </>
            ) : (
              <WalletMultiButton className="!bg-gradient-to-r !from-purple-600 !to-blue-600 hover:!from-purple-700 hover:!to-blue-700 !border-0 !transition-all !text-sm !px-6 !py-2 !rounded-lg !text-white !font-medium !shadow-lg hover:!shadow-purple-500/50" />
            )}
            <button
              onClick={() => onTabChange('settings')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeTab === 'settings'
                  ? 'text-white bg-white/10'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              Settings
            </button>
          </div>
        </div>
      </div>
      </nav>

      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
    </>
  );
}