'use client';

import { useEffect, useState } from 'react';
import { usePOSStore } from '@/store/pos-store';
import { WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalErrorNotification() {
    const globalError = usePOSStore(s => s.globalError);
    const setGlobalError = usePOSStore(s => s.setGlobalError);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (globalError) {
            setVisible(true);
            const timer = setTimeout(() => {
               setVisible(false);
               setTimeout(() => setGlobalError(null), 300); // clear after animation
            }, 5000); // Auto-hide after 5 seconds
            return () => clearTimeout(timer);
        }
    }, [globalError, setGlobalError]);

    if (!globalError && !visible) return null;

    return (
        <div className={`fixed bottom-4 right-4 max-w-sm w-full bg-white border-l-4 border-l-red-500 rounded-lg shadow-xl p-4 z-50 transition-all duration-300 transform pointer-events-auto ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="bg-red-100 p-2 rounded-full shrink-0">
                    <WifiOff className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1 mt-0.5">
                    <h3 className="font-semibold text-sm text-slate-800">Connection Error</h3>
                    <p className="text-xs text-slate-500 mt-1">{globalError}</p>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 shrink-0 -mr-2 -mt-2 text-slate-400 hover:text-slate-600 rounded-full" 
                    onClick={() => {
                        setVisible(false);
                        setTimeout(() => setGlobalError(null), 300);
                    }}
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
