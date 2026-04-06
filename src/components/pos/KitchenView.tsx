'use client';

import { usePOSStore } from '@/store/pos-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChefHat, Clock, Check, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrderItem } from '@/lib/types';
import { isGameCategory } from '@/lib/constants';

export default function KitchenView() {
    const tableBills = usePOSStore(state => state.tableBills);
    const completedOrders = usePOSStore(state => state.completedOrders);
    const kitchenStatuses = usePOSStore(state => state.kitchenStatuses);
    const setKitchenStatus = usePOSStore(state => state.setKitchenStatus);
    const clearKitchenStatus = usePOSStore(state => state.clearKitchenStatus);
    const menuItems = usePOSStore(state => state.menuItems);

    // Build category lookup to filter out game items from kitchen display
    const catLookup: Record<string, string> = {};
    menuItems.forEach(mi => { 
        catLookup[mi.id] = mi.category; 
        catLookup[mi.name.toLowerCase()] = mi.category;
    });

    const getCategory = (item: OrderItem) => {
        return catLookup[item.id] || catLookup[item.name.toLowerCase()] || '';
    };

    // Combine 1) Live Unpaid Table Bills and 2) Paid Completed Takeaways
    const activeTickets: any[] = [];

    const processedKeys = new Set<string>();

    // 1. Paid / Completed Orders waiting to be cooked (Takeaway/Delivery)
    completedOrders.forEach(order => {
        if (kitchenStatuses[order.id]) {
            const statusObj = kitchenStatuses[order.id];
            // Render it as a queued ticket
            let prefix = (order.order_type || 'takeaway').toUpperCase().replace('_', ' ');
            if (prefix.startsWith('DINE IN')) return; // Just in case, dine in clears immediately

            // Filter out game items from the ticket
            const filteredItems = order.items.filter(item => {
                const cat = getCategory(item);
                return !isGameCategory(cat);
            });
            if (filteredItems.length === 0) return; // All games — skip this ticket

            processedKeys.add(order.id);

            activeTickets.push({
                key: order.id,
                items: filteredItems,
                displayName: `${prefix} #${order.id.substring(0, 4)}`,
                isTable: false,
                isPaid: true,
                ...statusObj
            });
        }
    });

    // 2. Live Tables (Dine-in) or Waiter Typing (Takeaway/Delivery)
    Object.entries(tableBills).forEach(([key, items]) => {
        if (items.length === 0 || key === 'dine_in_unselected') return;
        if (processedKeys.has(key)) return; // Skip if already processed!

        // Filter out game items
        const filteredItems = items.filter(item => {
            const cat = getCategory(item);
            return !isGameCategory(cat);
        });
        if (filteredItems.length === 0) return; // All games — skip

        const statusObj = kitchenStatuses[key] || { status: 'pending', updatedAt: 0 };
        
        let displayName = key;
        let isTable = false;
        let isPaid = false;
        
        if (key.startsWith('T')) {
            displayName = `Table ${key.substring(1)}`;
            isTable = true;
        } else if (key === 'takeaway') {
            displayName = 'Takeaway (Wait...)';
        } else if (key === 'delivery') {
            displayName = 'Delivery (Wait...)';
        } else if (key.length >= 20) {
            // It's a UUID from a completed order that hasn't synced into completedOrders array yet
            displayName = `TAKEAWAY #${key.substring(0, 4)}`;
            isPaid = true;
        }

        activeTickets.push({
            key,
            items: filteredItems,
            displayName,
            isTable,
            isPaid,
            ...statusObj
        });
    });

    // Sort tickets
    activeTickets.sort((a, b) => {
        if (a.status !== b.status) {
            return a.status === 'pending' ? -1 : 1;
        }
        return b.updatedAt - a.updatedAt;
    });

    return (
        <div className="bg-slate-50 min-h-full flex flex-col gap-6 p-2 sm:p-4 md:p-6 pb-6">
            <div className="flex items-center justify-between bg-white p-4 sm:px-6 rounded-xl border border-slate-200 shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                        <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
                    </div>
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-0.5">Kitchen Display</h2>
                        <p className="text-slate-500 text-[10px] sm:text-xs">Live feed of active orders to prepare</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => usePOSStore.getState().fetchKitchenTicketsFromSupabase()}
                        className="h-8 sm:h-9 text-xs sm:text-sm text-slate-600 border-slate-200 hover:bg-slate-100 hidden sm:flex"
                    >
                        <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                        Refresh
                    </Button>
                    <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => usePOSStore.getState().fetchKitchenTicketsFromSupabase()}
                        className="h-8 w-8 sm:hidden text-slate-600 border-slate-200 hover:bg-slate-100"
                    >
                        <RefreshCcw className="w-3.5 h-3.5" />
                    </Button>
                    
                    <div className="text-xs sm:text-sm font-semibold text-slate-600 bg-slate-100 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-slate-200 shadow-inner">
                        <span className="text-orange-600 font-bold mr-1">{activeTickets.length}</span> Active Ticket{activeTickets.length !== 1 ? 's' : ''}
                    </div>
                </div>
            </div>

            {activeTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 min-h-[50vh] text-slate-400">
                    <ChefHat className="w-16 h-16 sm:w-24 sm:h-24 mb-4 sm:mb-6 opacity-20" />
                    <h3 className="text-lg sm:text-2xl font-bold text-slate-500 mb-1">No active orders right now</h3>
                    <p className="text-xs sm:text-sm text-slate-400">Waiters are currently taking orders.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                    {activeTickets.map(({ key, items, status, preparedItems, displayName, isTable, isPaid }) => {
                        const isPrepared = status === 'prepared';

                        return (
                            <Card key={key} className={`border-2 ${isPrepared ? 'border-slate-200 bg-slate-50/50 opacity-80' : isTable ? 'border-orange-200 bg-amber-50/10' : 'border-indigo-200 bg-indigo-50/10'} shadow-md overflow-hidden flex flex-col`}>
                                <CardHeader className={`py-3 px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b ${isPrepared ? 'bg-slate-100 border-slate-200' : isTable ? 'bg-orange-50/80 border-orange-100' : 'bg-indigo-50/80 border-indigo-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <CardTitle className={`text-lg sm:text-xl font-black ${isPrepared ? 'text-slate-500 line-through decoration-slate-300 decoration-2' : isTable ? 'text-orange-700' : 'text-indigo-700'} uppercase tracking-tight`}>
                                            {displayName}
                                        </CardTitle>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isPaid && isPrepared && (
                                            <Button size="sm" onClick={() => clearKitchenStatus(key)} className="h-7 text-[10px] px-3 bg-slate-800 hover:bg-slate-700 text-white font-bold shadow-sm rounded-r-none border-r border-slate-600 uppercase tracking-wide">
                                                Deliver
                                            </Button>
                                        )}
                                        {isPrepared ? (
                                            <Button size="sm" variant="outline" onClick={() => setKitchenStatus(key, 'pending')} className={`h-7 text-[10px] px-2 bg-white text-slate-500 hover:text-slate-700 shadow-sm border-slate-200 ${isPaid ? 'rounded-l-none' : ''}`}>
                                                <RefreshCcw className="w-3 h-3 mr-1" /> Undo
                                            </Button>
                                        ) : (
                                            <Button size="sm" onClick={() => setKitchenStatus(key, 'prepared')} className="h-7 text-[10px] px-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-sm">
                                                <Check className="w-3 h-3 mr-1" /> Prepared
                                            </Button>
                                        )}
                                        <div className={`text-[10px] sm:text-xs font-bold flex items-center bg-white px-2 py-1 rounded shadow-sm border uppercase tracking-wide ${isPrepared ? 'text-slate-400 border-slate-200' : 'text-emerald-600 border-emerald-100'}`}>
                                            <Clock className="w-3 h-3 mr-1" /> {isPaid ? 'Paid' : 'Live'}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0 flex-1 bg-white">
                                    <ul className="divide-y divide-slate-100">
                                        {items.flatMap((item: OrderItem, idx: number) => {
                                            // Get how many were previously prepared
                                            const prepQty = Math.min(item.quantity, preparedItems?.[item.id] || 0);
                                            const newQty = item.quantity - prepQty;
                                            
                                            const rows = [];
                                            
                                            // 1) Render the ALREADY PREPARED / SERVED portion
                                            if (prepQty > 0) {
                                                rows.push(
                                                    <li key={`${item.id}-${idx}-prep`} className={`p-3 sm:p-4 flex items-start gap-3 bg-slate-50 transition-colors ${!isPrepared ? 'opacity-60' : ''}`}>
                                                        <div className="bg-slate-200 text-slate-500 font-extrabold rounded-md px-2.5 py-1 text-sm sm:text-base border border-slate-300 min-w-[2.5rem] sm:min-w-[3rem] text-center shrink-0 shadow-none">
                                                            {prepQty}x
                                                        </div>
                                                        <div className="flex-1">
                                                            <span className="font-semibold text-slate-600 text-[15px] sm:text-base pt-0.5 sm:pt-1 leading-snug line-through decoration-slate-400 decoration-2">
                                                                {item.name}
                                                            </span>
                                                            {!isPrepared && (
                                                                <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">✓ Served / Prepped</div>
                                                            )}
                                                        </div>
                                                    </li>
                                                );
                                            }

                                            // 2) Render the NEW / UNPREPARED portion
                                            if (newQty > 0) {
                                                rows.push(
                                                    <li key={`${item.id}-${idx}-new`} className="p-3 sm:p-4 flex items-start gap-3 hover:bg-amber-50/30 transition-colors">
                                                        <div className={`font-extrabold rounded-md px-2.5 py-1 text-sm sm:text-base border min-w-[2.5rem] sm:min-w-[3rem] text-center shrink-0 shadow-sm ${prepQty > 0 ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                                                            {newQty}x
                                                        </div>
                                                        <div className="flex-1">
                                                            <span className="font-semibold text-slate-800 text-[15px] sm:text-base pt-0.5 sm:pt-1 leading-snug">
                                                                {item.name}
                                                            </span>
                                                            {prepQty > 0 && (
                                                                <div className="text-[10px] text-orange-600 font-bold uppercase mt-1 flex items-center">
                                                                    <span className="animate-pulse w-2 h-2 bg-orange-500 rounded-full mr-1.5 inline-block"></span>
                                                                    New Order Added
                                                                </div>
                                                            )}
                                                        </div>
                                                    </li>
                                                );
                                            }

                                            return rows;
                                        })}
                                    </ul>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
