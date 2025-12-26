import { useEffect, useState } from 'react';
import { X, ExternalLink, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

export interface TransactionToastData {
  id: string;
  type: 'etf_create' | 'etf_buy' | 'etf_sell' | 'token_swap';
  status: 'pending' | 'success' | 'error';
  message: string;
  txSignature?: string;
  swapSignatures?: string[];
  tokenSubstitutions?: Array<{
    originalToken: string;
    actualToken: string;
    isSubstituted: boolean;
    symbol: string;
    weight: number;
  }>;
  network?: 'mainnet' | 'devnet';
}

interface TransactionToastProps {
  toast: TransactionToastData;
  onClose: (id: string) => void;
}

export function TransactionToast({ toast, onClose }: TransactionToastProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSolscanLink = (signature: string, network: 'mainnet' | 'devnet' = 'devnet') => {
    const cluster = network === 'mainnet' ? '' : `?cluster=${network}`;
    return `https://solscan.io/tx/${signature}${cluster}`;
  };

  const getIcon = () => {
    switch (toast.status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'pending':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
    }
  };

  const getTypeLabel = () => {
    switch (toast.type) {
      case 'etf_create':
        return 'ETF Created';
      case 'etf_buy':
        return 'ETF Purchase';
      case 'etf_sell':
        return 'ETF Sale';
      case 'token_swap':
        return 'Token Swap';
    }
  };

  return (
    <div className="backdrop-blur-sm border border-white/20 rounded-xl p-4 shadow-2xl min-w-[400px] max-w-[500px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          {getIcon()}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-white font-medium">{getTypeLabel()}</h4>
              <button
                onClick={() => onClose(toast.id)}
                className="text-white/40 hover:text-white/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-white text-sm">{toast.message}</p>

            {/* Main Transaction Link */}
            {toast.txSignature && toast.status === 'success' && (
              <a
                href={getSolscanLink(toast.txSignature, toast.network)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                View on Solscan
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {/* Token Swaps Details */}
            {toast.swapSignatures && toast.swapSignatures.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs text-white hover:text-white/80 transition-colors"
                >
                  {isExpanded ? '▼' : '▶'} {toast.swapSignatures.length} Token Swap
                  {toast.swapSignatures.length > 1 ? 's' : ''}
                </button>

                {isExpanded && toast.tokenSubstitutions && (
                  <div className="mt-2 space-y-2 pl-4 border-l-2 border-white/10">
                    {toast.tokenSubstitutions.map((swap, idx) => (
                      <div key={idx} className="text-xs">
                        <div className="flex items-center justify-between">
                          <div className="text-white">
                            {swap.isSubstituted && (
                              <span className="text-yellow-400 mr-1">⚠️ Substituted:</span>
                            )}
                            {swap.weight.toFixed(1)}% allocation - {swap.symbol}
                          </div>
                        </div>
                        {swap.isSubstituted && (
                          <div className="text-white/60 mt-1">
                            Original: {swap.originalToken.slice(0, 8)}...
                            <br />
                            Used: USDC ({swap.actualToken.slice(0, 8)}...)
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Toast Container Component
interface ToastContainerProps {
  toasts: TransactionToastData[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-3">
      {toasts.map((toast) => (
        <TransactionToast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

// Toast Hook
export function useToast() {
  const [toasts, setToasts] = useState<TransactionToastData[]>([]);

  const addToast = (toast: Omit<TransactionToastData, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    // Auto-remove success toasts after 10 seconds
    if (toast.status === 'success') {
      setTimeout(() => {
        removeToast(id);
      }, 10000);
    }

    return id;
  };

  const updateToast = (id: string, updates: Partial<TransactionToastData>) => {
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, ...updates } : toast))
    );
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, addToast, updateToast, removeToast };
}
