import React, { createContext, useContext, useState, useEffect } from 'react';
import { clusterApiUrl } from '@solana/web3.js';

export type Network = 'devnet' | 'mainnet-beta';

interface NetworkContextType {
  network: Network;
  setNetwork: (network: Network) => void;
  rpcEndpoint: string;
  isDevnet: boolean;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  // Default to devnet
  const [network, setNetworkState] = useState<Network>('devnet');

  // Get RPC endpoint based on network
  const rpcEndpoint = network === 'devnet'
    ? clusterApiUrl('devnet')
    : clusterApiUrl('mainnet-beta');

  const isDevnet = network === 'devnet';

  // Load network preference from localStorage on mount
  useEffect(() => {
    const savedNetwork = localStorage.getItem('solana-network') as Network | null;
    if (savedNetwork && (savedNetwork === 'devnet' || savedNetwork === 'mainnet-beta')) {
      setNetworkState(savedNetwork);
    }
  }, []);

  // Save network preference to localStorage when it changes
  const setNetwork = (newNetwork: Network) => {
    setNetworkState(newNetwork);
    localStorage.setItem('solana-network', newNetwork);
  };

  return (
    <NetworkContext.Provider value={{ network, setNetwork, rpcEndpoint, isDevnet }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}
