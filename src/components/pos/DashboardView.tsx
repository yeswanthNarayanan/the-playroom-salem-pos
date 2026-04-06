'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePOSStore } from '@/store/pos-store';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, ListOrdered, Award, RefreshCw, Wallet, ShoppingBag, Clock, FileText, PieChart as PieChartIcon, Gamepad2 } from 'lucide-react';
import { isGameCategory } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ChartDataPoint {
    name: string;
    sales: number;
}

type DateRange = 'today' | 'custom' | 'week' | 'month' | 'year' | 'all';

export default function DashboardView() {
    const completedOrders = usePOSStore(state => state.completedOrders);
    const menuItems = usePOSStore(state => state.menuItems);
    const isOnline = usePOSStore(state => state.isOnline);

    const [totalSales, setTotalSales] = useState(0);
    const [ordersCount, setOrdersCount] = useState(0);
    const [mostSoldItem, setMostSoldItem] = useState('N/A');
    const [averageOrderValue, setAverageOrderValue] = useState(0);
    const [totalItemsSold, setTotalItemsSold] = useState(0);
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [paymentMethodData, setPaymentMethodData] = useState<{ name: string; value: number }[]>([]);
    const [recentOrders, setRecentOrders] = useState<{ id: string; total: number; timestamp: string; type: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange>('today');
    const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [currentOrdersData, setCurrentOrdersData] = useState<any[]>([]); // To hold data for CSV export
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

    // Games stats
    const [gamesRevenue, setGamesRevenue] = useState(0);
    const [topGame, setTopGame] = useState('N/A');
    const [gamesSessions, setGamesSessions] = useState(0);
    const [foodRevenue, setFoodRevenue] = useState(0);

    // Colors for the pie chart
    const COLORS = ['#10b981', '#6366f1', '#f59e0b'];

    const getDateRange = useCallback(() => {
        const startDate = new Date();
        const endDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        if (dateRange === 'custom') {
            const [y, m, d] = customDate.split('-');
            if (y && m && d) {
                startDate.setFullYear(Number(y), Number(m) - 1, Number(d));
                endDate.setFullYear(Number(y), Number(m) - 1, Number(d));
            }
        } else if (dateRange === 'week') {
            startDate.setDate(startDate.getDate() - startDate.getDay()); // Sunday
            endDate.setDate(startDate.getDate() + 6); // Saturday
        } else if (dateRange === 'month') {
            startDate.setDate(1);
            endDate.setMonth(endDate.getMonth() + 1, 0); // Last day of month
        } else if (dateRange === 'year') {
            startDate.setMonth(0, 1);
            endDate.setMonth(11, 31);
        } else if (dateRange === 'all') {
            startDate.setFullYear(2020, 0, 1);
        }
        return { startDate, endDate };
    }, [dateRange, customDate]);

    // ─── Helper: apply stats from a list of orders ───────────────────────────
    const applyStats = useCallback((orders: any[], itemsList?: { order_id: string; menu_item_name: string; quantity: number }[]) => {
        const total = orders.reduce((sum: number, o: any) => sum + Number(o.total), 0);
        setTotalSales(total);
        setOrdersCount(orders.length);
        setAverageOrderValue(orders.length > 0 ? total / orders.length : 0);
        setCurrentOrdersData(orders);

        // Recent orders
        const sortedOrders = [...orders].sort(
            (a, b) => new Date(b.created_at || b.timestamp).getTime() - new Date(a.created_at || a.timestamp).getTime()
        );
        setRecentOrders(sortedOrders.slice(0, 8).map(o => {
            let orderItems: any[] = [];
            if (itemsList && itemsList.length > 0) {
                orderItems = itemsList.filter(item => item.order_id === o.id).map(item => ({
                    name: item.menu_item_name,
                    quantity: item.quantity
                }));
            } else {
                orderItems = o.items || [];
            }

            return {
                id: (o.id || '').slice(0, 8) + '...',
                fullId: o.id,
                total: Number(o.total),
                timestamp: new Date(o.created_at || o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: o.order_type || 'takeaway',
                items: orderItems,
                payment_method: o.payment_method || 'cash'
            };
        }));

        // Payment method breakdown
        const paymentCounts: Record<string, number> = { cash: 0, card: 0, upi: 0 };
        orders.forEach((o: any) => {
            const method = o.payment_method || 'cash';
            paymentCounts[method] = (paymentCounts[method] || 0) + 1;
        });
        setPaymentMethodData(
            Object.entries(paymentCounts)
                .filter(([_, v]) => v > 0)
                .map(([name, value]) => ({ name: name.toUpperCase(), value }))
        );

        // Chart breakdown dynamic by date range
        if (dateRange === 'today' || dateRange === 'custom') {
            // Hourly breakdown (8 AM to 9 PM)
            setChartData(
                Array.from({ length: 14 }).map((_, i) => {
                    const hour = i + 8;
                    const sales = orders
                        .filter((o: any) => new Date(o.created_at || o.timestamp).getHours() === hour)
                        .reduce((sum: number, o: any) => sum + Number(o.total), 0);
                    return { name: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`, sales };
                })
            );
        } else if (dateRange === 'week') {
            // Daily breakdown for the week (Sun to Sat)
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            setChartData(
                days.map((dayName, idx) => {
                    const sales = orders
                        .filter((o: any) => new Date(o.created_at || o.timestamp).getDay() === idx)
                        .reduce((sum: number, o: any) => sum + Number(o.total), 0);
                    return { name: dayName, sales };
                })
            );
        } else if (dateRange === 'month') {
            // Date-wise for the month (1 to 31)
            const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
            setChartData(
                Array.from({ length: daysInMonth }).map((_, i) => {
                    const date = i + 1;
                    const sales = orders
                        .filter((o: any) => new Date(o.created_at || o.timestamp).getDate() === date)
                        .reduce((sum: number, o: any) => sum + Number(o.total), 0);
                    return { name: `${date}`, sales };
                })
            );
        } else if (dateRange === 'year' || dateRange === 'all') {
            // Month-wise
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            setChartData(
                months.map((monthName, idx) => {
                    const sales = orders
                        .filter((o: any) => new Date(o.created_at || o.timestamp).getMonth() === idx)
                        .reduce((sum: number, o: any) => sum + Number(o.total), 0);
                    return { name: monthName, sales };
                })
            );
        }

        // Item stats — use Supabase order_items if provided, otherwise use local items
        // Also compute games vs food stats
        const catLookup: Record<string, string> = {};
        menuItems.forEach(mi => { catLookup[mi.name] = mi.category || 'Uncategorized'; });

        let gRev = 0, fRev = 0, gSessions = 0;
        const gameCounts: Record<string, number> = {};

        if (itemsList && itemsList.length > 0) {
            const counts: Record<string, number> = {};
            let itemsCount = 0;
            const validOrderIds = new Set(orders.map(o => o.id));

            itemsList.forEach(oi => {
                if (validOrderIds.has(oi.order_id)) {
                    counts[oi.menu_item_name] = (counts[oi.menu_item_name] || 0) + oi.quantity;
                    itemsCount += oi.quantity;

                    // Games vs Food split
                    const cat = catLookup[oi.menu_item_name] || 'Uncategorized';
                    const price = (oi as any).price_at_time ? Number((oi as any).price_at_time) * oi.quantity : 0;
                    if (isGameCategory(cat)) {
                        gRev += price;
                        gSessions += oi.quantity;
                        gameCounts[oi.menu_item_name] = (gameCounts[oi.menu_item_name] || 0) + oi.quantity;
                    } else {
                        fRev += price;
                    }
                }
            });
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            setMostSoldItem(sorted.length > 0 ? sorted[0][0] : 'N/A');
            setTotalItemsSold(itemsCount);
        } else {
            // Fallback: local items
            const counts: Record<string, number> = {};
            let itemsCount = 0;
            orders.forEach((order: any) => {
                (order.items || []).forEach((item: any) => {
                    counts[item.name] = (counts[item.name] || 0) + item.quantity;
                    itemsCount += item.quantity;

                    // Games vs Food split
                    const cat = catLookup[item.name] || 'Uncategorized';
                    if (isGameCategory(cat)) {
                        gRev += item.price * item.quantity;
                        gSessions += item.quantity;
                        gameCounts[item.name] = (gameCounts[item.name] || 0) + item.quantity;
                    } else {
                        fRev += item.price * item.quantity;
                    }
                });
            });
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            setMostSoldItem(sorted.length > 0 ? sorted[0][0] : 'N/A');
            setTotalItemsSold(itemsCount);
        }

        // If we couldn't compute price-based split (no price_at_time in Supabase items list),
        // fall back to total - gRev for food
        if (gRev === 0 && fRev === 0 && total > 0) {
            // Try computing from local completed orders
            const orderIdSet = new Set(orders.map((o: any) => o.id));
            completedOrders.filter(o => orderIdSet.has(o.id)).forEach(order => {
                (order.items || []).forEach(item => {
                    const cat = catLookup[item.name] || 'Uncategorized';
                    if (isGameCategory(cat)) {
                        gRev += item.price * item.quantity;
                        gSessions += item.quantity;
                        gameCounts[item.name] = (gameCounts[item.name] || 0) + item.quantity;
                    } else {
                        fRev += item.price * item.quantity;
                    }
                });
            });
        }

        setGamesRevenue(gRev);
        setFoodRevenue(fRev > 0 ? fRev : total - gRev);
        setGamesSessions(gSessions);
        const topGameEntry = Object.entries(gameCounts).sort((a, b) => b[1] - a[1]);
        setTopGame(topGameEntry.length > 0 ? topGameEntry[0][0] : 'N/A');
    }, [dateRange, menuItems, completedOrders]);

    // ─── ONLINE: Fetch directly from Supabase ────────────────────────────────
    const fetchFromSupabase = useCallback(async () => {
        setLoading(true);
        try {
            const { startDate, endDate } = getDateRange();

            // Fetch orders
            let query = supabase.from('orders').select('id, total, created_at, order_type, payment_method');
            if (dateRange !== 'all') {
                query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
            }
            const { data: ordersData, error: ordersError } = await query;
            if (ordersError) throw ordersError;

            // Fetch order items for item stats
            const { data: orderItemsData, error: orderItemsError } = await supabase
                .from('order_items')
                .select('order_id, menu_item_name, quantity');

            applyStats(
                ordersData || [],
                !orderItemsError ? (orderItemsData || []) : undefined
            );
        } catch (err) {
            console.error('[Dashboard] Supabase fetch failed, falling back to local:', err);
            // Fallback to local on error
            fetchFromLocal();
        } finally {
            setLoading(false);
        }
    }, [dateRange, getDateRange, applyStats]);

    // ─── OFFLINE: Read from local IndexedDB (completedOrders) ────────────────
    const fetchFromLocal = useCallback(() => {
        const { startDate, endDate } = getDateRange();
        const filtered = completedOrders.filter(o => {
            const d = new Date(o.timestamp);
            return dateRange === 'all' || (d >= startDate && d <= endDate);
        });
        applyStats(filtered);
    }, [completedOrders, dateRange, getDateRange, applyStats]);

    // ─── Main effect: switch data source based on connectivity ───────────────
    useEffect(() => {
        if (isOnline) {
            fetchFromSupabase();
        } else {
            fetchFromLocal();
        }
    }, [isOnline, dateRange, fetchFromSupabase, fetchFromLocal]);

    // Also update offline view reactively when new orders are completed offline
    useEffect(() => {
        if (!isOnline) {
            fetchFromLocal();
        }
    }, [completedOrders, isOnline, fetchFromLocal]);

    // ─── Refresh handler ─────────────────────────────────────────────────────
    const handleRefresh = useCallback(() => {
        if (isOnline) {
            fetchFromSupabase();
        } else {
            fetchFromLocal();
        }
    }, [isOnline, fetchFromSupabase, fetchFromLocal]);

    const handleDownloadCSV = async () => {
        if (currentOrdersData.length === 0) return;

        // CSV Header
        let csvContent = "Order ID,Date,Time,Order Type,Payment Method,Items Ordered,Total Amount (INR)\n";

        let orderItemsMap: Record<string, string[]> = {};

        // Use local completedOrders for item details
        completedOrders.forEach(order => {
            if (order.items && order.items.length > 0) {
                orderItemsMap[order.id] = order.items.map(
                    item => `${item.name} x${item.quantity}`
                );
            }
        });

        // If online, also fetch from Supabase for complete coverage
        if (isOnline) {
            try {
                const orderIds = currentOrdersData.map((o: any) => o.id);
                const { data: itemsData } = await supabase
                    .from('order_items')
                    .select('order_id, menu_item_name, quantity')
                    .in('order_id', orderIds);

                if (itemsData) {
                    itemsData.forEach(item => {
                        if (!orderItemsMap[item.order_id]) {
                            orderItemsMap[item.order_id] = [];
                        }
                        orderItemsMap[item.order_id] = []; // Reset to use Supabase data
                    });
                    itemsData.forEach(item => {
                        if (!orderItemsMap[item.order_id]) {
                            orderItemsMap[item.order_id] = [];
                        }
                        orderItemsMap[item.order_id].push(
                            `${item.menu_item_name} x${item.quantity}`
                        );
                    });
                }
            } catch (err) {
                console.error('[CSV] Supabase fetch failed, using local items:', err);
            }
        }

        // CSV Rows
        currentOrdersData.forEach((order: any) => {
            const dateObj = new Date(order.created_at || order.timestamp);
            const dateStr = dateObj.toLocaleDateString();
            const timeStr = dateObj.toLocaleTimeString();
            const type = (order.order_type || 'takeaway').replace('_', ' ').toUpperCase();
            const method = (order.payment_method || 'cash').toUpperCase();
            const total = Number(order.total).toFixed(2);
            const items = (orderItemsMap[order.id] || []).join(' | ');

            csvContent += `"${order.id}","${dateStr}","${timeStr}","${type}","${method}","${items}","${total}"\n`;
        });

        // Create Blob and Download Link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `spicy_queen_report_${dateRange}_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-slate-50 min-h-full flex flex-col gap-6 pb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1">Analytics Dashboard</h2>
                    <p className="text-slate-500 text-xs">
                        {isOnline ? 'Live data from Supabase' : 'Synced data from IndexedDB (offline mode)'}
                    </p>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <Select value={dateRange} onValueChange={(val: DateRange) => setDateRange(val)}>
                        <SelectTrigger className="w-full sm:w-[150px] bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Select Range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="custom">Specific Date</SelectItem>
                            <SelectItem value="week">This Week</SelectItem>
                            <SelectItem value="month">This Month</SelectItem>
                            <SelectItem value="year">This Year</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                    {dateRange === 'custom' && (
                        <input
                            type="date"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-md px-3 py-2 w-full sm:w-auto h-9 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                        />
                    )}
                    <Button variant="outline" size="sm" onClick={handleDownloadCSV} disabled={currentOrdersData.length === 0} className="w-full sm:w-auto">
                        <FileText className="w-4 h-4 mr-2 text-indigo-500" />
                        Export CSV
                    </Button>
                    <Button variant="default" size="sm" onClick={handleRefresh} disabled={loading} className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700">
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Total Sales Today</CardTitle>
                        <DollarSign className="w-5 h-5 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">₹{totalSales.toFixed(2)}</div>
                        <p className="text-xs text-emerald-600 flex items-center mt-1 font-medium">
                            <TrendingUp className="w-3 h-3 mr-1" /> Live from {isOnline ? 'Supabase' : 'local'}
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Orders Count</CardTitle>
                        <ListOrdered className="w-5 h-5 text-indigo-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{ordersCount}</div>
                        <p className="text-xs text-slate-500 mt-1">
                            Completed transactions
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Most Sold Item</CardTitle>
                        <Award className="w-5 h-5 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-800 truncate" title={mostSoldItem}>
                            {mostSoldItem}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Top performing menu item
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Average Order Value</CardTitle>
                        <Wallet className="w-5 h-5 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">₹{averageOrderValue.toFixed(2)}</div>
                        <p className="text-xs text-slate-500 mt-1">
                            Per transaction average
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">Total Items Sold</CardTitle>
                        <ShoppingBag className="w-5 h-5 text-pink-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{totalItemsSold}</div>
                        <p className="text-xs text-slate-500 mt-1">
                            Individual products sold
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Games Stats Row */}
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-3">
                <Card className="border-purple-200 shadow-sm bg-purple-50/30">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-purple-700">Games Revenue</CardTitle>
                        <Gamepad2 className="w-5 h-5 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-purple-800">₹{gamesRevenue.toFixed(2)}</div>
                        <p className="text-xs text-purple-500 mt-1 font-medium">
                            {gamesSessions} sessions played
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-purple-200 shadow-sm bg-purple-50/30">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-purple-700">Top Game</CardTitle>
                        <Award className="w-5 h-5 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-800 truncate" title={topGame}>
                            {topGame}
                        </div>
                        <p className="text-xs text-purple-500 mt-1">
                            Most popular game
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-emerald-200 shadow-sm bg-emerald-50/30">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-700">Food Revenue</CardTitle>
                        <DollarSign className="w-5 h-5 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-emerald-800">₹{foodRevenue.toFixed(2)}</div>
                        <p className="text-xs text-emerald-500 mt-1 font-medium">
                            Excluding games billing
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border-slate-200 shadow-sm flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-slate-800 flex items-center">
                            <TrendingUp className="w-5 h-5 mr-2 text-emerald-600" />
                            {dateRange === 'today' || dateRange === 'custom' ? 'Sales by Hour' :
                                (dateRange === 'week' || dateRange === 'month' ? 'Sales by Day' : 'Sales by Month')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1">
                        {totalSales > 0 ? (
                            <div className="h-[300px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => `₹${value}`} />
                                        <Tooltip
                                            cursor={{ fill: '#f1f5f9' }}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            formatter={(value: any) => [`₹${value}`, 'Sales']}
                                        />
                                        <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex h-[300px] w-full flex-col items-center justify-center text-slate-400">
                                <FileText className="w-12 h-12 mb-3 text-slate-300" />
                                <p className="font-medium">No sales data yet for today.</p>
                                <p className="text-sm">Complete some orders to see the chart.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-slate-800 flex items-center">
                            <Clock className="w-5 h-5 mr-2 text-blue-500" />
                            Recent Orders
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 p-0">
                        {recentOrders.length > 0 ? (
                            <div className="overflow-x-auto scrollbar-hide">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                                            <TableHead className="w-[80px]">Time</TableHead>
                                            <TableHead>Order ID & Type</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentOrders.map((order, idx) => (
                                            <TableRow key={idx} className="cursor-pointer hover:bg-slate-100" onClick={() => setSelectedOrder(order)}>
                                                <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                                                    {order.timestamp}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-mono text-xs text-slate-600">#{order.id}</div>
                                                    <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase mt-0.5">{order.type.replace('_', ' ')}</div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-slate-800">
                                                    ₹{order.total.toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="flex h-full min-h-[200px] w-full flex-col items-center justify-center text-slate-400 p-6">
                                <p className="text-sm text-center">No orders have been placed today.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            </div>

            {/* Order Details Modal */}
            <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                <DialogContent className="sm:max-w-md bg-white text-slate-800 border-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex justify-between items-center">
                            <span>Order Details</span>
                        </DialogTitle>
                    </DialogHeader>
                    {selectedOrder && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="text-slate-500">Time:</div>
                                <div className="font-medium text-right">{selectedOrder.timestamp}</div>
                                <div className="text-slate-500">Order Type:</div>
                                <div className="font-medium text-right uppercase">{selectedOrder.type.replace('_', ' ')}</div>
                                <div className="text-slate-500">Payment:</div>
                                <div className="font-medium text-right uppercase">{selectedOrder.payment_method}</div>
                            </div>
                            <div className="border-t border-slate-100 pt-3">
                                <h4 className="font-bold mb-2 text-sm text-slate-700">Items Ordered</h4>
                                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                                    <div className="space-y-2">
                                        {selectedOrder.items.map((item: any, i: number) => (
                                            <div key={i} className="flex justify-between items-center text-sm bg-slate-50 p-2 rounded-md border border-slate-100">
                                                <span className="font-medium truncate mr-2">{item.name}</span>
                                                <span className="font-bold text-emerald-600 shrink-0">x{item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-400 italic">No item details available.</div>
                                )}
                            </div>
                            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                                <span className="font-bold text-slate-600">Total</span>
                                <span className="text-xl font-bold text-slate-800">₹{selectedOrder.total.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
