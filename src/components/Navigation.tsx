import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { WalletModal } from './WalletModal';
import { NetworkSwitch } from './NetworkSwitch';
import { TokenCloud } from './ui/TokenCloud';

// X (Twitter) Icon
const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

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
            <button
              onClick={() => onTabChange('dashboard')}
              className="flex items-center gap-2 text-xl tracking-tight hover:opacity-80 transition-opacity"
            >
              <TokenCloud size={40} />
              MTF
            </button>
            
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
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black border border-white/10 hover:bg-white/5 transition-all text-white font-medium"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  <span className="text-sm">{truncateAddress(publicKey.toBase58())}</span>
                </button>
              </>
            ) : (
              <WalletMultiButton className="!bg-black !border !border-white/10 hover:!bg-white/5 !transition-all !text-sm !px-6 !py-2 !rounded-lg !text-white !font-medium" />
            )}
            <a
              href="https://x.com/MTFSOL"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-all"
              title="Follow us on X"
            >
              <XIcon />
            </a>
            <button
              onClick={() => onTabChange('settings')}
              className={`px-4 py-2 rounded-lg border border-white/10 transition-all ${
                activeTab === 'settings'
                  ? 'text-white bg-white/10'
                  : 'text-white hover:bg-white/5'
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