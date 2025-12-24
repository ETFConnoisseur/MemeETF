'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { WalletModal } from '@/src/components/WalletModal';

export default function Navbar() {
  const { connected, publicKey } = useWallet();
  const pathname = usePathname();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'List New ETF', path: '/list-etf' },
    { label: 'Listings', path: '/listings' },
    { label: 'Leaderboard', path: '/leaderboard' },
    { label: 'Portfolio', path: '/portfolio' },
    { label: 'Rewards', path: '/rewards' },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname?.startsWith(path);
  };

  return (
    <>
      <nav className="border-b border-white/10 bg-black/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-12">
              <Link href="/" className="text-xl tracking-tight hover:opacity-80 transition-opacity">
                MTF
              </Link>
              
              {/* Navigation Links */}
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`px-4 py-2 rounded-lg transition-all ${
                      isActive(item.path)
                        ? 'text-white bg-white/10'
                        : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-4">
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
              <Link
                href="/settings"
                className={`px-4 py-2 rounded-lg transition-all ${
                  pathname === '/settings'
                    ? 'text-white bg-white/10'
                    : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                Settings
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <WalletModal isOpen={isWalletModalOpen} onClose={() => setIsWalletModalOpen(false)} />
    </>
  );
}

