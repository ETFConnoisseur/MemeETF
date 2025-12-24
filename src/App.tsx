import { useState } from 'react';
import { WalletContextProvider } from './components/providers/WalletProvider';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { Listings } from './components/Listings';
import { ETFDetail } from './components/ETFDetail';
import { Leaderboard } from './components/Leaderboard';
import { Portfolio } from './components/Portfolio';
import { Rewards } from './components/Rewards';
import { Settings } from './components/Settings';
import { ListNewETF } from './components/ListNewETF';
import { ErrorBoundary } from './components/ErrorBoundary';

interface NavigationData {
  etfId?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [navData, setNavData] = useState<NavigationData>({});

  const handleNavigate = (tab: string, data?: NavigationData) => {
    setActiveTab(tab);
    if (data) {
      setNavData(data);
    }
  };

  const renderContent = () => {
    try {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      case 'listings':
        return <Listings onNavigate={handleNavigate} />;
      case 'etf-detail':
        return navData.etfId ? (
          <ETFDetail etfId={navData.etfId} onNavigate={handleNavigate} />
        ) : (
          <Listings onNavigate={handleNavigate} />
        );
      case 'leaderboard':
        return <Leaderboard onNavigate={handleNavigate} />;
      case 'portfolio':
        return <Portfolio />;
      case 'rewards':
        return <Rewards />;
      case 'settings':
        return <Settings />;
      case 'list-new-etf':
        return <ListNewETF onNavigate={handleNavigate} />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
      }
    } catch (error) {
      console.error('Error rendering content:', error);
      return (
        <div className="max-w-xl mx-auto px-6 py-12 text-center">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8">
            <h2 className="text-xl text-red-400 mb-4">Something went wrong</h2>
            <p className="text-white/60 mb-6">Failed to load this page</p>
            <button 
              onClick={() => handleNavigate('dashboard')}
              className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }
  };

  return (
    <WalletContextProvider>
      <div className="min-h-screen bg-black text-white">
        <Navigation activeTab={activeTab} onTabChange={handleNavigate} />
        <main className="pb-12">
          <ErrorBoundary>
          {renderContent()}
          </ErrorBoundary>
        </main>
      </div>
    </WalletContextProvider>
  );
}
