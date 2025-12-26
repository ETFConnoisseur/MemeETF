import { createContext, useContext } from 'react';
import { TransactionToastData } from '../components/TransactionToast';

interface ToastContextValue {
  addToast: (toast: Omit<TransactionToastData, 'id'>) => string;
  updateToast: (id: string, updates: Partial<TransactionToastData>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({
  children,
  value
}: {
  children: React.ReactNode;
  value: ToastContextValue
}) {
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider');
  }
  return context;
}
