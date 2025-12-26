'use client';

import React from 'react';
import { useNetwork } from '@/lib/contexts/NetworkContext';

export default function NetworkToggle() {
  const { network, setNetwork, isDevnet } = useNetwork();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700">
      <span className={`text-xs font-medium ${isDevnet ? 'text-yellow-400' : 'text-gray-500'}`}>
        DEVNET
      </span>
      <button
        onClick={() => setNetwork(isDevnet ? 'mainnet-beta' : 'devnet')}
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        style={{ backgroundColor: isDevnet ? '#eab308' : '#3b82f6' }}
        aria-label={`Switch to ${isDevnet ? 'mainnet' : 'devnet'}`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            isDevnet ? 'translate-x-1' : 'translate-x-5'
          }`}
        />
      </button>
      <span className={`text-xs font-medium ${!isDevnet ? 'text-blue-400' : 'text-gray-500'}`}>
        MAINNET
      </span>
    </div>
  );
}
