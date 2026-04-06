import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MenuItem, Order, OrderItem, SyncMutation, KitchenTicket, HeldOrder } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { isGameCategory } from '@/lib/constants';
import { v4 as uuidv4 } from 'uuid';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isDuplicateKeyError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
        return (error as { code: string }).code === '23505';
    }
    return false;
}

// ─── Offline Queue Processor ─────────────────────────────────────────────────
async function processMutation(mutation: SyncMutation): Promise<boolean> {
    try {
        switch (mutation.type) {
            case 'CREATE_ORDER': {
                const { order } = mutation.payload;
                const { error: orderError } = await supabase.from('orders').insert({
                    id: order.id,
                    total: order.total,
                    created_at: order.timestamp,
                    order_type: order.order_type || 'takeaway',
                    payment_method: order.payment_method || 'cash',
                });
                if (orderError && !isDuplicateKeyError(orderError)) throw orderError;
                if (!orderError) {
                    const orderItems = order.items.map((item) => ({
                        order_id: order.id,
                        menu_item_name: item.name,
                        quantity: item.quantity,
                        price_at_time: item.price,
                    }));
                    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
                    if (itemsError && !isDuplicateKeyError(itemsError)) throw itemsError;
                }
                return true;
            }
            case 'ADD_MENU_ITEM': {
                const { item } = mutation.payload;
                const { error } = await supabase.from('menu_items').insert({
                    id: item.id, name: item.name, category: item.category,
                    price: item.price, is_available: item.is_available,
                });
                if (error && !isDuplicateKeyError(error)) throw error;
                return true;
            }
            case 'UPDATE_MENU_ITEM': {
                const { id, updates } = mutation.payload;
                const { error } = await supabase.from('menu_items').update(updates).eq('id', id);
                if (error) throw error;
                return true;
            }
            case 'TOGGLE_AVAILABILITY': {
                const { id, is_available } = mutation.payload;
                const { error } = await supabase
                    .from('menu_items')
                    .update({ is_available, updated_at: new Date().toISOString() })
                    .eq('id', id);
                if (error) throw error;
                return true;
            }
            // ── Kitchen ticket mutations (atomic RPCs) ───────────────────────
            case 'ADD_TICKET_ITEM': {
                const { ticketId, item } = mutation.payload;
                const { error } = await supabase.rpc('add_ticket_item', {
                    p_ticket_id: ticketId,
                    p_item_id: item.id,
                    p_item_name: item.name,
                    p_item_price: item.price,
                    p_quantity: item.quantity,
                });
                if (error) throw error;
                return true;
            }
            case 'REMOVE_TICKET_ITEM': {
                const { ticketId, itemId } = mutation.payload;
                const { error } = await supabase.rpc('remove_ticket_item', {
                    p_ticket_id: ticketId,
                    p_item_id: itemId,
                });
                if (error) throw error;
                return true;
            }
            case 'UPDATE_TICKET_ITEM_QTY': {
                const { ticketId, itemId, quantity } = mutation.payload;
                const { error } = await supabase.rpc('update_ticket_item_qty', {
                    p_ticket_id: ticketId,
                    p_item_id: itemId,
                    p_quantity: quantity,
                });
                if (error) throw error;
                return true;
            }
            case 'UPDATE_TICKET_STATUS': {
                const { ticketId, status, prepared_items } = mutation.payload;
                const { error } = await supabase.from('kitchen_tickets')
                    .update({ status, prepared_items, updated_at: new Date().toISOString() })
                    .eq('id', ticketId);
                if (error) throw error;
                return true;
            }
            case 'UPSERT_KITCHEN_TICKET': {
                const { ticket } = mutation.payload;
                const { error } = await supabase.from('kitchen_tickets').upsert({
                    id: ticket.id,
                    items: ticket.items,
                    status: ticket.status,
                    prepared_items: ticket.prepared_items,
                    updated_at: ticket.updated_at,
                }, { onConflict: 'id' });
                if (error) throw error;
                return true;
            }
            case 'DELETE_KITCHEN_TICKET': {
                const { id } = mutation.payload;
                const { error } = await supabase.from('kitchen_tickets').delete().eq('id', id);
                if (error && !isDuplicateKeyError(error)) throw error;
                return true;
            }
            default:
                return true;
        }
    } catch (err) {
        console.warn('[Sync] Failed to process mutation:', err);
        return false;
    }
}

// ─── Store Types ─────────────────────────────────────────────────────────────
export interface KitchenStatus {
    status: 'pending' | 'prepared';
    updatedAt: number;
    preparedItems?: Record<string, number>;
    previousPreparedItems?: Record<string, number>;
}

interface POSState {
    menuItems: MenuItem[];
    activeBill: OrderItem[];
    completedOrders: Order[];
    offlineQueue: SyncMutation[];
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncedAt: string | null;
    menuLoaded: boolean;
    activeOrderType: 'dine_in' | 'takeaway' | 'delivery';
    activePaymentMethod: 'cash' | 'split' | 'upi';
    printerEnabled: boolean;
    kitchenPrinterEnabled: boolean;
    activeTable: string | null;
    tableBills: Record<string, OrderItem[]>;
    kitchenStatuses: Record<string, KitchenStatus>;
    hotelName: string;
    hotelAddress: string;
    printerPaperSize: '58mm' | '80mm';
    heldOrders: HeldOrder[];

    // Actions
    addMenuItem: (item: Omit<MenuItem, 'id'>) => void;
    updateMenuItem: (id: string, updates: Partial<MenuItem>) => void;
    toggleMenuItemAvailability: (id: string) => void;

    addToBill: (item: MenuItem) => void;
    removeFromBill: (id: string) => void;
    updateBillQuantity: (id: string, quantity: number) => void;
    clearBill: () => void;
    setOrderType: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
    setActiveTable: (tableId: string | null) => void;
    setKitchenStatus: (tableId: string, status: 'pending' | 'prepared') => void;
    clearKitchenStatus: (id: string) => void;
    setPaymentMethod: (method: 'cash' | 'split' | 'upi') => void;
    completeOrder: (generatedOrderId?: string) => void;
    markBillAsSentToKitchen: () => void;
    togglePrinter: () => void;
    toggleKitchenPrinter: () => void;
    setHotelName: (name: string) => void;
    setHotelAddress: (address: string) => void;
    setPrinterPaperSize: (size: '58mm' | '80mm') => void;
    holdCurrentOrder: () => void;
    restoreHeldOrder: (id: string) => void;
    removeHeldOrder: (id: string) => void;

    // Sync actions
    setOnline: (online: boolean) => void;
    fetchMenuFromSupabase: () => Promise<void>;
    fetchOrdersFromSupabase: () => Promise<void>;
    fetchKitchenTicketsFromSupabase: () => Promise<void>;
    flushOfflineQueue: () => Promise<void>;
    clearCompletedOrders: () => void;
    globalError: string | null;
    setGlobalError: (error: string | null) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────
export const usePOSStore = create<POSState>()(
    persist(
        (set, get) => ({
            menuItems: [],
            activeBill: [],
            completedOrders: [],
            offlineQueue: [],
            isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
            isSyncing: false,
            lastSyncedAt: null,
            menuLoaded: false,
            activeOrderType: 'takeaway',
            activePaymentMethod: 'cash',
            printerEnabled: true,
            kitchenPrinterEnabled: false,
            activeTable: null,
            tableBills: {},
            kitchenStatuses: {},
            hotelName: 'THE PLAYROOM SALEM',
            hotelAddress: 'kondalampatty About round\nsalem',
            printerPaperSize: '58mm',
            heldOrders: [],
            globalError: null,

            setGlobalError: (error) => set({ globalError: error }),

            // ── Menu Item Management ─────────────────────────────────────────
            addMenuItem: (item) => {
                const newItem: MenuItem = { ...item, id: uuidv4() };
                set((state) => ({
                    menuItems: [...state.menuItems, newItem],
                    offlineQueue: [
                        ...state.offlineQueue,
                        { type: 'ADD_MENU_ITEM', payload: { item: newItem } },
                    ],
                }));
                get().flushOfflineQueue();
            },

            updateMenuItem: (id, updates) => {
                set((state) => ({
                    menuItems: state.menuItems.map((item) =>
                        item.id === id ? { ...item, ...updates } : item
                    ),
                    offlineQueue: [
                        ...state.offlineQueue,
                        { type: 'UPDATE_MENU_ITEM', payload: { id, updates } },
                    ],
                }));
                get().flushOfflineQueue();
            },

            toggleMenuItemAvailability: (id) => {
                const currentItem = get().menuItems.find((item) => item.id === id);
                if (!currentItem) return;
                const newVal = !currentItem.is_available;
                set((state) => ({
                    menuItems: state.menuItems.map((item) =>
                        item.id === id ? { ...item, is_available: newVal } : item
                    ),
                    offlineQueue: [
                        ...state.offlineQueue,
                        { type: 'TOGGLE_AVAILABILITY', payload: { id, is_available: newVal } },
                    ],
                }));
                get().flushOfflineQueue();
            },

            // ── Billing (each action syncs to Supabase via atomic RPCs) ──────
            addToBill: (menuItem) => {
                set((state) => {
                    const existingItem = state.activeBill.find((item) => item.id === menuItem.id);
                    const newBill = existingItem
                        ? state.activeBill.map((item) =>
                            item.id === menuItem.id
                                ? { ...item, quantity: item.quantity + 1 }
                                : item
                        )
                        : [
                            ...state.activeBill,
                            { id: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1 },
                        ];

                    const tableKey = state.activeOrderType === 'dine_in' ? (state.activeTable || 'dine_in_unselected') : state.activeOrderType;

                    return {
                        activeBill: newBill,
                        tableBills: { ...state.tableBills, [tableKey]: newBill },
                        kitchenStatuses: {
                            ...state.kitchenStatuses,
                            [tableKey]: {
                                ...state.kitchenStatuses[tableKey],
                                status: 'pending' as const,
                                updatedAt: Date.now()
                            }
                        },
                        offlineQueue: [
                            ...state.offlineQueue,
                            {
                                type: 'ADD_TICKET_ITEM' as const, payload: {
                                    ticketId: tableKey,
                                    item: { id: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1 },
                                }
                            },
                        ],
                    };
                });
                get().flushOfflineQueue();
            },

            removeFromBill: (id) => {
                set((state) => {
                    const newBill = state.activeBill.filter((item) => item.id !== id);
                    const tableKey = state.activeOrderType === 'dine_in' ? (state.activeTable || 'dine_in_unselected') : state.activeOrderType;
                    const newKitchenStatuses = { ...state.kitchenStatuses };
                    if (newBill.length === 0) {
                        delete newKitchenStatuses[tableKey];
                    } else {
                        newKitchenStatuses[tableKey] = { ...newKitchenStatuses[tableKey], updatedAt: Date.now() };
                    }
                    return {
                        activeBill: newBill,
                        tableBills: { ...state.tableBills, [tableKey]: newBill },
                        kitchenStatuses: newKitchenStatuses,
                        offlineQueue: [
                            ...state.offlineQueue,
                            { type: 'REMOVE_TICKET_ITEM' as const, payload: { ticketId: tableKey, itemId: id } },
                        ],
                    };
                });
                get().flushOfflineQueue();
            },

            updateBillQuantity: (id, quantity) => {
                set((state) => {
                    const newBill = quantity <= 0
                        ? state.activeBill.filter((item) => item.id !== id)
                        : state.activeBill.map((item) =>
                            item.id === id ? { ...item, quantity } : item
                        );
                    const tableKey = state.activeOrderType === 'dine_in' ? (state.activeTable || 'dine_in_unselected') : state.activeOrderType;
                    const newKitchenStatuses = { ...state.kitchenStatuses };
                    if (newBill.length === 0) {
                        delete newKitchenStatuses[tableKey];
                    } else {
                        newKitchenStatuses[tableKey] = {
                            ...newKitchenStatuses[tableKey],
                            status: 'pending',
                            updatedAt: Date.now()
                        };
                    }

                    const mutation: SyncMutation = quantity <= 0
                        ? { type: 'REMOVE_TICKET_ITEM', payload: { ticketId: tableKey, itemId: id } }
                        : { type: 'UPDATE_TICKET_ITEM_QTY', payload: { ticketId: tableKey, itemId: id, quantity } };

                    return {
                        activeBill: newBill,
                        tableBills: { ...state.tableBills, [tableKey]: newBill },
                        kitchenStatuses: newKitchenStatuses,
                        offlineQueue: [...state.offlineQueue, mutation],
                    };
                });
                get().flushOfflineQueue();
            },

            clearBill: () => {
                set((state) => {
                    const tableKey = state.activeOrderType === 'dine_in' ? (state.activeTable || 'dine_in_unselected') : state.activeOrderType;
                    const newKitchenStatuses = { ...state.kitchenStatuses };
                    delete newKitchenStatuses[tableKey];
                    return {
                        activeBill: [],
                        tableBills: { ...state.tableBills, [tableKey]: [] },
                        kitchenStatuses: newKitchenStatuses,
                        offlineQueue: [
                            ...state.offlineQueue,
                            { type: 'DELETE_KITCHEN_TICKET' as const, payload: { id: tableKey } },
                        ],
                    };
                });
                get().flushOfflineQueue();
            },

            setOrderType: (type) => set((state) => {
                const tableKey = type === 'dine_in' ? (state.activeTable || 'dine_in_unselected') : type;
                return {
                    activeOrderType: type,
                    activeBill: state.tableBills[tableKey] || []
                };
            }),

            setActiveTable: (tableId) => set((state) => {
                const tableKey = tableId || 'dine_in_unselected';
                return {
                    activeTable: tableId,
                    activeBill: state.tableBills[tableKey] || []
                };
            }),

            setKitchenStatus: (tableId, status) => {
                set((state) => {
                    const currentBill = state.tableBills[tableId] || [];
                    const currentStatus = state.kitchenStatuses[tableId] || { status: 'pending', updatedAt: Date.now() };

                    let newPreparedItems = currentStatus.preparedItems || {};
                    let newPrevPrepared = currentStatus.previousPreparedItems || {};

                    if (status === 'prepared') {
                        newPrevPrepared = { ...newPreparedItems };
                        newPreparedItems = {};
                        currentBill.forEach(item => {
                            newPreparedItems[item.id] = item.quantity;
                        });
                    } else {
                        newPreparedItems = { ...newPrevPrepared };
                    }

                    return {
                        kitchenStatuses: {
                            ...state.kitchenStatuses,
                            [tableId]: {
                                status,
                                updatedAt: Date.now(),
                                preparedItems: newPreparedItems,
                                previousPreparedItems: newPrevPrepared
                            }
                        },
                        offlineQueue: [
                            ...state.offlineQueue,
                            {
                                type: 'UPDATE_TICKET_STATUS' as const, payload: {
                                    ticketId: tableId,
                                    status,
                                    prepared_items: newPreparedItems,
                                }
                            },
                        ],
                    };
                });
                get().flushOfflineQueue();
            },

            clearKitchenStatus: (id) => {
                set((state) => {
                    const newStatuses = { ...state.kitchenStatuses };
                    delete newStatuses[id];
                    const newTableBills = { ...state.tableBills };
                    delete newTableBills[id];
                    return {
                        kitchenStatuses: newStatuses,
                        tableBills: newTableBills,
                        offlineQueue: [
                            ...state.offlineQueue,
                            { type: 'DELETE_KITCHEN_TICKET' as const, payload: { id } },
                        ],
                    };
                });
                get().flushOfflineQueue();
            },

            setPaymentMethod: (method) => set({ activePaymentMethod: method }),

            setHotelName: (name: string) => set({ hotelName: name }),
            setHotelAddress: (address: string) => set({ hotelAddress: address }),
            setPrinterPaperSize: (size: '58mm' | '80mm') => set({ printerPaperSize: size }),

            togglePrinter: () => set((state) => ({ printerEnabled: !state.printerEnabled })),
            toggleKitchenPrinter: () => set((state) => ({ kitchenPrinterEnabled: !state.kitchenPrinterEnabled })),

            holdCurrentOrder: () => {
                const state = get();
                if (state.activeBill.length === 0) return;
                const held: HeldOrder = {
                    id: uuidv4(),
                    items: [...state.activeBill],
                    orderType: state.activeOrderType as 'takeaway' | 'delivery',
                    paymentMethod: state.activePaymentMethod,
                    heldAt: new Date().toISOString(),
                };
                const tableKey = state.activeOrderType;
                const newTableBills = { ...state.tableBills };
                delete newTableBills[tableKey];
                set({ heldOrders: [...state.heldOrders, held], activeBill: [], tableBills: newTableBills });
            },

            restoreHeldOrder: (id: string) => {
                const state = get();
                const order = state.heldOrders.find(o => o.id === id);
                if (!order) return;
                const tableKey = order.orderType;
                set({
                    activeBill: [...order.items],
                    activeOrderType: order.orderType,
                    activePaymentMethod: order.paymentMethod,
                    tableBills: { ...state.tableBills, [tableKey]: [...order.items] },
                    heldOrders: state.heldOrders.filter(o => o.id !== id),
                });
            },

            removeHeldOrder: (id: string) => {
                set((s) => ({ heldOrders: s.heldOrders.filter(o => o.id !== id) }));
            },

            markBillAsSentToKitchen: () => {
                const state = get();
                const newBill = state.activeBill.map(item => ({ ...item, sentQuantity: item.quantity }));
                const tableKey = state.activeOrderType === 'dine_in' ? (state.activeTable || 'dine_in_unselected') : state.activeOrderType;

                const currentStatus = state.kitchenStatuses[tableKey] || { status: 'pending', updatedAt: Date.now() };

                set((s) => ({
                    activeBill: newBill,
                    tableBills: { ...s.tableBills, [tableKey]: newBill },
                    offlineQueue: [
                        ...s.offlineQueue,
                        {
                            type: 'UPSERT_KITCHEN_TICKET' as const,
                            payload: {
                                ticket: {
                                    id: tableKey,
                                    items: newBill,
                                    status: currentStatus.status as 'pending' | 'prepared',
                                    prepared_items: (currentStatus as any).preparedItems || {},
                                    updated_at: new Date().toISOString()
                                }
                            }
                        }
                    ]
                }));
                get().flushOfflineQueue();
            },

            completeOrder: (generatedOrderId?: string) => {
                const state = get();
                if (state.activeBill.length === 0) return;

                const total = state.activeBill.reduce(
                    (sum, item) => sum + item.price * item.quantity,
                    0
                );
                const finalOrderType = state.activeOrderType === 'dine_in' && state.activeTable
                    ? `dine_in_${state.activeTable}`
                    : state.activeOrderType;

                const newOrder: Order = {
                    id: generatedOrderId || uuidv4(),
                    items: [...state.activeBill],
                    total,
                    timestamp: new Date().toISOString(),
                    order_type: finalOrderType,
                    payment_method: state.activePaymentMethod,
                };

                const tableKey = state.activeOrderType === 'dine_in' ? (state.activeTable || 'dine_in_unselected') : state.activeOrderType;
                const newTableBills = { ...state.tableBills };
                delete newTableBills[tableKey];

                const newKitchenStatuses = { ...state.kitchenStatuses };
                delete newKitchenStatuses[tableKey];

                // Build offline queue entries
                const queueEntries: SyncMutation[] = [
                    { type: 'CREATE_ORDER', payload: { order: newOrder } },
                    { type: 'DELETE_KITCHEN_TICKET', payload: { id: tableKey } },
                ];

                // For takeaway/delivery: push paid order into kitchen for cooking
                // BUT filter out game items — they don't need cooking
                if (state.activeOrderType === 'takeaway' || state.activeOrderType === 'delivery') {
                    // Build a category lookup from menu items
                    const catLookup: Record<string, string> = {};
                    state.menuItems.forEach(mi => { 
                        catLookup[mi.id] = mi.category; 
                        catLookup[mi.name.toLowerCase()] = mi.category;
                    });

                    const kitchenItems = newOrder.items.filter(item => {
                        const cat = catLookup[item.id] || catLookup[item.name.toLowerCase()] || '';
                        return !isGameCategory(cat);
                    });

                    // Only create kitchen ticket if there are non-game items
                    if (kitchenItems.length > 0) {
                        newKitchenStatuses[newOrder.id] = { status: 'pending', updatedAt: Date.now() };
                        newTableBills[newOrder.id] = kitchenItems;
                        queueEntries.push({
                            type: 'UPSERT_KITCHEN_TICKET', payload: {
                                ticket: {
                                    id: newOrder.id,
                                    items: kitchenItems,
                                    status: 'pending',
                                    prepared_items: {},
                                    updated_at: new Date().toISOString(),
                                }
                            }
                        });
                    }
                }

                set((s) => ({
                    completedOrders: [...s.completedOrders, newOrder],
                    activeBill: [],
                    tableBills: newTableBills,
                    kitchenStatuses: newKitchenStatuses,
                    activeOrderType: 'takeaway',
                    activePaymentMethod: 'cash',
                    activeTable: null,
                    offlineQueue: [
                        ...s.offlineQueue,
                        ...queueEntries,
                    ],
                }));

                get().flushOfflineQueue();
            },

            // ── Sync ─────────────────────────────────────────────────────────
            setOnline: (online) => {
                set({ isOnline: online });
                if (online) {
                    get().flushOfflineQueue().finally(() => {
                        get().fetchMenuFromSupabase();
                        get().fetchOrdersFromSupabase();
                        get().fetchKitchenTicketsFromSupabase();
                    });
                }
            },

            fetchMenuFromSupabase: async () => {
                try {
                    const { data, error } = await supabase
                        .from('menu_items')
                        .select('*')
                        .order('created_at', { ascending: true });

                    if (error) throw error;
                    if (data) {
                        set({ menuItems: data as MenuItem[], menuLoaded: true });
                    }
                } catch (err) {
                    console.warn('[Sync] Failed to fetch menu:', err);
                    get().setGlobalError("Failed to fetch menu. Please connect to the internet.");
                }
            },

            fetchOrdersFromSupabase: async () => {
                try {
                    const { data: remoteOrders, error: ordersError } = await supabase
                        .from('orders')
                        .select('*');
                    if (ordersError) throw ordersError;

                    const { data: remoteItems, error: itemsError } = await supabase
                        .from('order_items')
                        .select('*');
                    if (itemsError) throw itemsError;

                    if (remoteOrders && remoteItems) {
                        const mappedRemoteOrders: Order[] = remoteOrders.map(ro => {
                            const orderItems = remoteItems
                                .filter(ri => ri.order_id === ro.id)
                                .map(ri => ({
                                    id: ri.menu_item_name,
                                    name: ri.menu_item_name,
                                    price: Number(ri.price_at_time),
                                    quantity: ri.quantity
                                }));
                            return {
                                id: ro.id,
                                total: Number(ro.total),
                                timestamp: ro.created_at,
                                order_type: ro.order_type || 'takeaway',
                                payment_method: ro.payment_method || 'cash',
                                items: orderItems
                            };
                        });

                        const finalOrders = mappedRemoteOrders.sort(
                            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                        );

                        set({ completedOrders: finalOrders });
                    }
                } catch (err) {
                    console.warn('[Sync] Failed to fetch orders:', err);
                    get().setGlobalError("Failed to fetch orders. Please connect to the internet.");
                }
            },

            fetchKitchenTicketsFromSupabase: async () => {
                try {
                    const { data, error } = await supabase
                        .from('kitchen_tickets')
                        .select('*');

                    if (error) throw error;
                    if (data) {
                        const newKitchenStatuses: Record<string, KitchenStatus> = {};
                        const newTableBills: Record<string, OrderItem[]> = {};

                        data.forEach((ticket: KitchenTicket) => {
                            newKitchenStatuses[ticket.id] = {
                                status: ticket.status as 'pending' | 'prepared',
                                updatedAt: new Date(ticket.updated_at).getTime(),
                                preparedItems: ticket.prepared_items || {},
                            };
                            newTableBills[ticket.id] = ticket.items || [];
                        });

                        const state = get();
                        const activeTableKey = state.activeOrderType === 'dine_in'
                            ? (state.activeTable || 'dine_in_unselected')
                            : state.activeOrderType;

                        set({
                            kitchenStatuses: newKitchenStatuses,
                            tableBills: newTableBills,
                            activeBill: newTableBills[activeTableKey] || [],
                        });
                    }
                } catch (err) {
                    console.warn('[Sync] Failed to fetch kitchen tickets:', err);
                    get().setGlobalError("Failed to fetch kitchen tickets. Please connect to the internet.");
                }
            },

            clearCompletedOrders: () => {
                set({ completedOrders: [] });
            },

            flushOfflineQueue: async () => {
                const state = get();
                if (state.isSyncing || state.offlineQueue.length === 0) return;
                if (!navigator.onLine) return;

                set({ isSyncing: true });

                const remaining: SyncMutation[] = [];
                for (const mutation of state.offlineQueue) {
                    const success = await processMutation(mutation);
                    if (!success) {
                        remaining.push(mutation);
                    }
                }

                set({
                    offlineQueue: remaining,
                    isSyncing: false,
                    lastSyncedAt: remaining.length === 0 ? new Date().toISOString() : state.lastSyncedAt,
                });
            },
        }),
        {
            name: 'pos-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                menuItems: state.menuItems,
                activeBill: state.activeBill,
                lastSyncedAt: state.lastSyncedAt,
                menuLoaded: state.menuLoaded,
                activeOrderType: state.activeOrderType,
                activePaymentMethod: state.activePaymentMethod,
                printerEnabled: state.printerEnabled,
                kitchenPrinterEnabled: state.kitchenPrinterEnabled,
                activeTable: state.activeTable,
                tableBills: state.tableBills,
                kitchenStatuses: state.kitchenStatuses,
                hotelName: state.hotelName,
                hotelAddress: state.hotelAddress,
                printerPaperSize: state.printerPaperSize,
                heldOrders: state.heldOrders,
            }),
        }
    )
);
