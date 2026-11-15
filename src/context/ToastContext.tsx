import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
}

interface ToastContextValue {
  notify: (arg1: ToastType | string, arg2?: string, arg3?: string) => void;
  confirmAction: (options: ConfirmOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = useCallback((arg1: ToastType | string, arg2?: string, arg3?: string) => {
    const id = Math.random().toString(36).slice(2, 9);
    let type: ToastType = 'info';
    let title = '';
    let description: string | undefined = undefined;

    if (arg1 === 'success' || arg1 === 'error' || arg1 === 'info') {
      type = arg1;
      title = arg2 || '';
      description = arg3;
    } else {
      title = arg1;
      if (arg2 === 'success' || arg2 === 'error' || arg2 === 'info') {
        type = arg2;
      } else if (arg2 === 'warning') {
        type = 'error';
      }
      description = arg3;
    }

    setToasts((prev) => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const confirmAction = useCallback((options: ConfirmOptions) => {
    setConfirmState(options);
  }, []);

  const handleConfirm = async () => {
    if (!confirmState) return;
    setBusy(true);
    try {
      await confirmState.onConfirm();
      setConfirmState(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToastContext.Provider value={{ notify, confirmAction }}>
      {children}

      {/* Toast Stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto bg-[#242A33] border border-neutral-700/80 rounded-lg p-3.5 shadow-xl flex items-start gap-3 text-sm text-[#F5F6F8] transition-opacity duration-150"
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-[#19C6B4] shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#F5F6F8] leading-snug">{t.title}</p>
              {t.description && <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{t.description}</p>}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-neutral-400 hover:text-white p-0.5 shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      {confirmState && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#242A33] border border-neutral-700 rounded-lg max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#F5F6F8]">{confirmState.title}</h3>
            <p className="text-sm text-neutral-300 mt-2 leading-relaxed">{confirmState.description}</p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmState(null)}
                className="px-4 py-2 text-xs font-medium text-neutral-300 bg-[#171A21] border border-neutral-700 rounded-md hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirm}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  confirmState.variant === 'danger'
                    ? 'bg-[#EF4444] text-white hover:bg-red-600'
                    : 'bg-[#FF8A32] text-[#171A21] hover:bg-[#ff9b4f]'
                }`}
              >
                {busy ? 'Processing...' : confirmState.confirmLabel || 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
