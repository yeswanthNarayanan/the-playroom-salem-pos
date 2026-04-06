'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePOSStore } from '@/store/pos-store';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw, Package, Tag, CreditCard, Calendar, ShoppingBag, Gamepad2 } from 'lucide-react';
import { isGameCategory } from '@/lib/constants';

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'all';

interface TopProduct {
    name: string;
    quantity: number;
    revenue: number;
}

interface TopCategory {
    category: string;
    revenue: number;
}

interface PaymentMode {
    method: string;
    count: number;
    revenue: number;
}

interface OrderTypeStat {
    type: string;
    count: number;
    revenue: number;
}

export default function SalesSummaryView() {
    const completedOrders = usePOSStore(state => state.completedOrders);
    const menuItems = usePOSStore(state => state.menuItems);
    const isOnline = usePOSStore(state => state.isOnline);

    const [dateRange, setDateRange] = useState<DateRange>('today');
    const [loading, setLoading] = useState(false);
    const [showAllProducts, setShowAllProducts] = useState(false);

    const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
    const [topCategories, setTopCategories] = useState<TopCategory[]>([]);
    const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
    const [orderTypes, setOrderTypes] = useState<OrderTypeStat[]>([]);
    const [dateLabel, setDateLabel] = useState('');

    // Games stats
    const [gamesRevenue, setGamesRevenue] = useState(0);
    const [gamesSessions, setGamesSessions] = useState(0);
    const [topGameName, setTopGameName] = useState('N/A');
    const [foodRevenue, setFoodRevenue] = useState(0);

    // ─── Date range boundaries ───────────────────────────────────────────────
    const getDateRange = useCallback(() => {
        const startDate = new Date();
        const endDate = new Date();

        if (dateRange === 'yesterday') {
            startDate.setDate(startDate.getDate() - 1);
            endDate.setDate(endDate.getDate() - 1);
        }

        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        if (dateRange === 'week') {
            startDate.setDate(startDate.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
        } else if (dateRange === 'month') {
            startDate.setDate(1);
        } else if (dateRange === 'all') {
            startDate.setFullYear(2020);
        }

        return { startDate, endDate };
    }, [dateRange]);

    // ─── Compute summary from a set of orders ────────────────────────────────
    const computeSummary = useCallback((
        orders: any[],
        orderItems?: { order_id: string; menu_item_name: string; quantity: number; price_at_time: number }[]
    ) => {
        // Date label
        const { startDate, endDate } = getDateRange();
        if (dateRange === 'today') {
            setDateLabel(`On ${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`);
        } else if (dateRange === 'yesterday') {
            setDateLabel(`On ${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`);
        } else if (dateRange === 'week') {
            setDateLabel(`${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' })} - ${endDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`);
        } else {
            setDateLabel('');
        }

        // Payment Mode Summary (always show CASH and UPI)
        const pmMap: Record<string, { count: number; revenue: number }> = {
            'CASH': { count: 0, revenue: 0 },
            'UPI': { count: 0, revenue: 0 }
        };
        orders.forEach((o: any) => {
            const m = (o.payment_method || 'cash').toUpperCase();
            if (!pmMap[m]) pmMap[m] = { count: 0, revenue: 0 };
            pmMap[m].count += 1;
            pmMap[m].revenue += Number(o.total);
        });
        setPaymentModes(
            Object.entries(pmMap)
                .map(([method, d]) => ({ method, ...d }))
                .sort((a, b) => b.revenue - a.revenue)
        );

        // Order Type Summary (always show DINE-IN and TAKEAWAY)
        const otMap: Record<string, { count: number; revenue: number }> = {
            'DINE-IN': { count: 0, revenue: 0 },
            'TAKEAWAY': { count: 0, revenue: 0 }
        };
        orders.forEach((o: any) => {
            let t = (o.order_type || 'takeaway').toUpperCase();
            if (t === 'DINE_IN') t = 'DINE-IN'; // normalize
            if (!otMap[t]) otMap[t] = { count: 0, revenue: 0 };
            otMap[t].count += 1;
            otMap[t].revenue += Number(o.total);
        });
        setOrderTypes(
            Object.entries(otMap)
                .map(([type, d]) => ({ type, ...d }))
                .sort((a, b) => b.revenue - a.revenue)
        );

        // Category lookup from menu items
        const catLookup: Record<string, string> = {};
        menuItems.forEach(mi => { catLookup[mi.name] = mi.category || 'Uncategorized'; });

        // Top Products & Categories
        const productMap: Record<string, { qty: number; rev: number }> = {};
        const catMap: Record<string, number> = {};

        const orderIdSet = new Set(orders.map((o: any) => o.id));

        if (orderItems && orderItems.length > 0) {
            // Use Supabase order_items — filter to orders in range
            orderItems
                .filter(oi => orderIdSet.has(oi.order_id))
                .forEach(oi => {
                    if (!productMap[oi.menu_item_name]) productMap[oi.menu_item_name] = { qty: 0, rev: 0 };
                    productMap[oi.menu_item_name].qty += oi.quantity;
                    productMap[oi.menu_item_name].rev += Number(oi.price_at_time) * oi.quantity;

                    const cat = catLookup[oi.menu_item_name] || 'Uncategorized';
                    catMap[cat] = (catMap[cat] || 0) + Number(oi.price_at_time) * oi.quantity;
                });
        } else {
            // Fallback: local completed orders
            completedOrders
                .filter(o => orderIdSet.has(o.id))
                .forEach(order => {
                    (order.items || []).forEach(item => {
                        if (!productMap[item.name]) productMap[item.name] = { qty: 0, rev: 0 };
                        productMap[item.name].qty += item.quantity;
                        productMap[item.name].rev += item.price * item.quantity;

                        const cat = catLookup[item.name] || 'Uncategorized';
                        catMap[cat] = (catMap[cat] || 0) + item.price * item.quantity;
                    });
                });
        }

        setTopProducts(
            Object.entries(productMap)
                .map(([name, d]) => ({ name, quantity: d.qty, revenue: d.rev }))
                .sort((a, b) => b.revenue - a.revenue)
        );
        setTopCategories(
            Object.entries(catMap)
                .map(([category, revenue]) => ({ category, revenue }))
                .sort((a, b) => b.revenue - a.revenue)
        );

        // Compute games vs food stats
        let gRev = 0, fRev = 0, gSess = 0;
        const gCounts: Record<string, number> = {};
        Object.entries(productMap).forEach(([name, d]) => {
            const cat = catLookup[name] || 'Uncategorized';
            if (isGameCategory(cat)) {
                gRev += d.rev;
                gSess += d.qty;
                gCounts[name] = (gCounts[name] || 0) + d.qty;
            } else {
                fRev += d.rev;
            }
        });
        setGamesRevenue(gRev);
        setGamesSessions(gSess);
        setFoodRevenue(fRev);
        const topG = Object.entries(gCounts).sort((a, b) => b[1] - a[1]);
        setTopGameName(topG.length > 0 ? topG[0][0] : 'N/A');
    }, [getDateRange, dateRange, menuItems, completedOrders]);

    // ─── Fetch from Supabase ─────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (isOnline) {
                const { startDate, endDate } = getDateRange();
                let query = supabase.from('orders').select('id, total, created_at, order_type, payment_method');
                if (dateRange !== 'all') {
                    query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
                }
                const { data: ordersData, error: ordersError } = await query;
                if (ordersError) throw ordersError;

                const { data: itemsData } = await supabase
                    .from('order_items')
                    .select('order_id, menu_item_name, quantity, price_at_time');

                computeSummary(ordersData || [], itemsData || undefined);
            } else {
                // Offline: use local data
                const { startDate, endDate } = getDateRange();
                const filtered = completedOrders.filter(o => {
                    const d = new Date(o.timestamp);
                    return dateRange === 'all' || (d >= startDate && d <= endDate);
                });
                computeSummary(filtered);
            }
        } catch (err) {
            console.error('[SalesSummary] Fetch failed:', err);
            // Fallback to local
            const { startDate, endDate } = getDateRange();
            const filtered = completedOrders.filter(o => {
                const d = new Date(o.timestamp);
                return dateRange === 'all' || (d >= startDate && d <= endDate);
            });
            computeSummary(filtered);
        } finally {
            setLoading(false);
        }
    }, [isOnline, dateRange, getDateRange, computeSummary, completedOrders]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ─── UI ──────────────────────────────────────────────────────────────────
    return (
        <div className="bg-slate-50 min-h-full flex flex-col gap-4 pb-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800">Sale Summary</h2>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <Select value={dateRange} onValueChange={(val: DateRange) => setDateRange(val)}>
                        <SelectTrigger className="w-full sm:w-[140px] bg-slate-50 border-slate-200 text-sm">
                            <SelectValue placeholder="Select Range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="week">Last 7 Days</SelectItem>
                            <SelectItem value="month">This Month</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="default" size="sm" onClick={fetchData} disabled={loading} className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700">
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Date label */}
            {dateLabel && (
                <div className="flex items-center gap-2 text-sm text-slate-500 px-1">
                    <Calendar className="w-4 h-4" />
                    {dateLabel}
                </div>
            )}

            {/* Top Products + Top Categories side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Products */}
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center">
                                <Package className="w-4 h-4 mr-2 text-indigo-500" />
                                Top Products
                            </CardTitle>
                            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                                <input type="checkbox" checked={showAllProducts} onChange={e => setShowAllProducts(e.target.checked)} className="rounded border-slate-300" />
                                Show all
                            </label>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-3">
                        <div className="max-h-[400px] overflow-y-auto border border-slate-100 rounded-lg">
                            {topProducts.length > 0 ? (
                                <Table>
                                    <TableBody>
                                        {(showAllProducts ? topProducts : topProducts.slice(0, 8)).map((item, idx) => (
                                            <TableRow key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                <TableCell className="py-2.5">
                                                    <div className="font-medium text-slate-700 text-sm">{item.name}</div>
                                                    <div className="text-xs text-slate-400">x {item.quantity} unit</div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-slate-800 text-sm whitespace-nowrap">₹{item.revenue.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="p-8 text-center text-slate-400 text-sm">No product data for this period</div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Top Categories */}
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center">
                            <Tag className="w-4 h-4 mr-2 text-orange-500" />
                            Top Categories
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3">
                        <div className="border border-slate-100 rounded-lg">
                            {topCategories.length > 0 ? (
                                <Table>
                                    <TableBody>
                                        {topCategories.map((cat, idx) => (
                                            <TableRow key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                <TableCell className="py-2.5 font-medium text-slate-700 text-sm">{cat.category}</TableCell>
                                                <TableCell className="text-right font-semibold text-slate-800 text-sm whitespace-nowrap">₹{cat.revenue.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="p-8 text-center text-slate-400 text-sm">No category data for this period</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Games Summary */}
            <Card className="border-purple-200 shadow-sm bg-purple-50/20">
                <CardHeader className="pb-0">
                    <CardTitle className="text-sm font-semibold text-purple-700 flex items-center">
                        <Gamepad2 className="w-4 h-4 mr-2 text-purple-500" />
                        Games Summary
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="bg-white rounded-lg border border-purple-100 p-4 text-center">
                            <div className="text-2xl font-bold text-purple-800">₹{gamesRevenue.toFixed(2)}</div>
                            <p className="text-xs text-purple-500 mt-1 font-medium">Games Revenue</p>
                        </div>
                        <div className="bg-white rounded-lg border border-purple-100 p-4 text-center">
                            <div className="text-2xl font-bold text-purple-800">{gamesSessions}</div>
                            <p className="text-xs text-purple-500 mt-1 font-medium">Game Sessions</p>
                        </div>
                        <div className="bg-white rounded-lg border border-purple-100 p-4 text-center">
                            <div className="text-2xl font-bold text-purple-800 truncate" title={topGameName}>{topGameName}</div>
                            <p className="text-xs text-purple-500 mt-1 font-medium">Top Game</p>
                        </div>
                        <div className="bg-white rounded-lg border border-emerald-100 p-4 text-center">
                            <div className="text-2xl font-bold text-emerald-800">₹{foodRevenue.toFixed(2)}</div>
                            <p className="text-xs text-emerald-500 mt-1 font-medium">Food Only Revenue</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Order Type + Payment Mode side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Order Type Summary */}
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center">
                            <ShoppingBag className="w-4 h-4 mr-2 text-pink-500" />
                            Order Type Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3">
                        <div className="border border-slate-100 rounded-lg overflow-x-auto">
                            <Table>
                                <TableBody>
                                    {orderTypes.map((ot, idx) => (
                                        <TableRow key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                            <TableCell className="py-3 font-medium text-slate-700">{ot.type}</TableCell>
                                            <TableCell className="text-center font-bold text-slate-600">{ot.count} Orders</TableCell>
                                            <TableCell className="text-right font-bold text-slate-800 whitespace-nowrap">₹{ot.revenue.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Payment Mode Summary */}
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center">
                            <CreditCard className="w-4 h-4 mr-2 text-blue-500" />
                            Payment Mode Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3">
                        <div className="border border-slate-100 rounded-lg overflow-x-auto">
                            <Table>
                                <TableBody>
                                    {paymentModes.map((pm, idx) => (
                                        <TableRow key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                            <TableCell className="py-3 font-medium text-slate-700">{pm.method}</TableCell>
                                            <TableCell className="text-center font-bold text-slate-600">{pm.count} Orders</TableCell>
                                            <TableCell className="text-right font-bold text-slate-800 whitespace-nowrap">₹{pm.revenue.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
