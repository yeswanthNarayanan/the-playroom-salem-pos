'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { usePOSStore } from '@/store/pos-store';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Subscribes to Supabase Realtime for menu_items, orders, and kitchen_tickets.
 * Also sets up a 10-second polling fallback to catch any missed events.
 * Mount this hook ONCE (in SyncStatus).
 */
export function useRealtimeSync() {
    const channelRef = useRef<RealtimeChannel | null>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const channel = supabase
            .channel('pos-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'menu_items' },
                () => { usePOSStore.getState().fetchMenuFromSupabase(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => { usePOSStore.getState().fetchOrdersFromSupabase(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'kitchen_tickets' },
                () => { usePOSStore.getState().fetchKitchenTicketsFromSupabase(); }
            )
            .subscribe((status) => {
                console.log('[Realtime] Channel status:', status);
            });

        channelRef.current = channel;

        // Polling fallback every 10s — flush queue first, then fetch
        pollingRef.current = setInterval(() => {
            if (navigator.onLine) {
                usePOSStore.getState().flushOfflineQueue().finally(() => {
                    usePOSStore.getState().fetchMenuFromSupabase();
                    usePOSStore.getState().fetchOrdersFromSupabase();
                    usePOSStore.getState().fetchKitchenTicketsFromSupabase();
                });
            }
        }, 10_000);

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, []);
}
