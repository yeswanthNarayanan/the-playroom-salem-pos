'use client';

import { useEffect, useState } from 'react';
import { usePOSStore } from '@/store/pos-store';
import { Cloud, CloudOff, Loader2, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export function SyncStatus() {
    const [mounted, setMounted] = useState(false);
    const isOnline = usePOSStore((s) => s.isOnline);
    const isSyncing = usePOSStore((s) => s.isSyncing);
    const offlineQueue = usePOSStore((s) => s.offlineQueue);
    const setOnline = usePOSStore((s) => s.setOnline);
    const fetchMenu = usePOSStore((s) => s.fetchMenuFromSupabase);
    const fetchOrders = usePOSStore((s) => s.fetchOrdersFromSupabase);
    const fetchKitchenTickets = usePOSStore((s) => s.fetchKitchenTicketsFromSupabase);
    const menuLoaded = usePOSStore((s) => s.menuLoaded);

    // Mount Supabase Realtime subscriptions + polling fallback
    useRealtimeSync();

    // Mark as mounted (client-only)
    useEffect(() => {
        setMounted(true);
    }, []);

    // Listen to browser online/offline events
    useEffect(() => {
        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        // On mount: fetch all data
        setOnline(navigator.onLine);
        if (navigator.onLine) {
            fetchMenu();
            fetchOrders();
            fetchKitchenTickets();
        }

        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, [setOnline, fetchMenu, fetchOrders, fetchKitchenTickets, menuLoaded]);

    // Periodically try to flush the queue every 5 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (navigator.onLine && offlineQueue.length > 0) {
                usePOSStore.getState().flushOfflineQueue();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [offlineQueue.length]);

    // Server-side and initial client render: show a stable placeholder
    if (!mounted) {
        return (
            <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none">
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Loading...
            </Badge>
        );
    }

    if (isSyncing) {
        return (
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-none animate-pulse">
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Syncing...
            </Badge>
        );
    }

    if (!isOnline) {
        return (
            <div className="flex items-center gap-2">
                {offlineQueue.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                        {offlineQueue.length} pending
                    </Badge>
                )}
                <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
                    <WifiOff className="w-4 h-4 mr-1" />
                    Offline Mode
                </Badge>
            </div>
        );
    }

    if (offlineQueue.length > 0) {
        return (
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-none text-xs">
                    {offlineQueue.length} pending
                </Badge>
                <Badge variant="outline" className="text-slate-500 border-slate-300">
                    <CloudOff className="w-4 h-4 mr-1" />
                    Queued
                </Badge>
            </div>
        );
    }

    return (
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none">
            <Cloud className="w-4 h-4 mr-1" />
            Cloud Synced
        </Badge>
    );
}
