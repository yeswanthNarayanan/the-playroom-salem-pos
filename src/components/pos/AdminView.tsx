'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePOSStore } from '@/store/pos-store';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Printer, Database, RefreshCw, Download, Trash2, CheckCircle2 } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MAX_BYTES = 500 * 1024 * 1024;

export default function AdminView() {
    const { menuItems, addMenuItem, toggleMenuItemAvailability, printerEnabled, togglePrinter, kitchenPrinterEnabled, toggleKitchenPrinter, hotelName, hotelAddress, setHotelName, setHotelAddress, printerPaperSize, setPrinterPaperSize, clearCompletedOrders } = usePOSStore();
    const isOnline = usePOSStore(state => state.isOnline);
    const [isAddOpen, setIsAddOpen] = useState(false);

    const [newItemName, setNewItemName] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');

    // DB Status state
    const [dbSize, setDbSize] = useState<number | null>(null);
    const [dbLoading, setDbLoading] = useState(false);
    const [dbError, setDbError] = useState<string | null>(null);
    const [isResetOpen, setIsResetOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isWiping, setIsWiping] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [wipeSuccess, setWipeSuccess] = useState(false);

    const fetchDbSize = useCallback(async () => {
        if (!isOnline) { setDbError('Offline'); return; }
        setDbLoading(true);
        setDbError(null);
        try {
            const { data, error } = await supabase.rpc('get_db_size_bytes');
            if (error) { setDbError('RPC not found. Run the SQL script in Supabase.'); return; }
            setDbSize(Number(data));
        } catch { setDbError('Network error'); }
        finally { setDbLoading(false); }
    }, [isOnline]);

    useEffect(() => { fetchDbSize(); }, [fetchDbSize]);

    const usedMB = dbSize ? (dbSize / (1024 * 1024)).toFixed(2) : '--';
    const usedPercent = dbSize ? Math.min(100, (dbSize / MAX_BYTES) * 100) : 0;
    const barColor = usedPercent >= 90 ? 'bg-red-500' : usedPercent >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

    const handleExportAll = async () => {
        setIsExporting(true);
        try {
            let allOrders: any[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;
            while (hasMore) {
                const { data, error } = await supabase.from('orders').select('id, total, created_at, order_type, payment_method').range(from, from + limit - 1).order('created_at', { ascending: false });
                if (error || !data || data.length === 0) { hasMore = false; } else { allOrders.push(...data); from += limit; if (data.length < limit) hasMore = false; }
            }
            if (allOrders.length === 0) { alert('No orders found.'); return; }
            let csv = "Order ID,Date,Time,Order Type,Payment Method,Total (INR)\n";
            allOrders.forEach(o => { const d = new Date(o.created_at); csv += `"${o.id}","${d.toLocaleDateString()}","${d.toLocaleTimeString()}","${(o.order_type||'takeaway').replace('_',' ').toUpperCase()}","${(o.payment_method||'cash').toUpperCase()}","${Number(o.total).toFixed(2)}"\n`; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `spicy_queen_BACKUP_${Date.now()}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch { alert('Export failed.'); }
        finally { setIsExporting(false); }
    };

    const handleWipe = async () => {
        if (confirmText.trim().toUpperCase() !== 'CONFIRM') return;
        setIsWiping(true);
        try {
            const { error } = await supabase.rpc('reset_business_data');
            if (error) { alert('Wipe failed: ' + error.message); return; }
            clearCompletedOrders(); setWipeSuccess(true); setDbSize(0);
            setTimeout(() => { setIsResetOpen(false); setWipeSuccess(false); setConfirmText(''); }, 3000);
        } catch { alert('Network error during wipe.'); }
        finally { setIsWiping(false); }
    };

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItemName || !newItemCategory || !newItemPrice) return;

        addMenuItem({
            name: newItemName,
            category: newItemCategory,
            price: parseFloat(newItemPrice),
            is_available: true,
        });

        setNewItemName('');
        setNewItemCategory('');
        setNewItemPrice('');
        setIsAddOpen(false);
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            {/* ── Database Status Card ── */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-indigo-100">
                            <Database className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Database Status</h3>
                            <p className="text-xs text-slate-500">Supabase Free Tier — 500 MB Limit</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchDbSize} disabled={dbLoading} className="text-slate-500">
                        <RefreshCw className={`w-4 h-4 ${dbLoading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {dbError ? (
                    <p className="text-xs text-red-500 bg-red-50 p-2 rounded-md">{dbError}</p>
                ) : (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600 font-medium">{usedMB} MB used</span>
                            <span className="text-slate-400">{usedPercent.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${usedPercent}%` }} />
                        </div>
                    </div>
                )}

                <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs" onClick={handleExportAll} disabled={isExporting}>
                        <Download className={`w-3.5 h-3.5 mr-1.5 ${isExporting ? 'animate-bounce' : ''}`} />
                        {isExporting ? 'Exporting...' : 'Export All Orders'}
                    </Button>
                    <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="flex-1 border-red-200 text-red-600 hover:bg-red-50 text-xs">
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Reset Database
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md w-[95vw] border-red-200">
                            <DialogHeader>
                                <DialogTitle className="text-red-600">⚠️ Reset Database</DialogTitle>
                                <DialogDescription>This will permanently delete ALL orders and order items. This cannot be undone. Export your data first!</DialogDescription>
                            </DialogHeader>
                            {wipeSuccess ? (
                                <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg flex flex-col items-center text-center">
                                    <CheckCircle2 className="w-8 h-8 mb-2" />
                                    <p className="font-bold">Database Wiped Successfully!</p>
                                </div>
                            ) : (
                                <div className="space-y-3 py-2">
                                    <input type="text" placeholder='Type CONFIRM to proceed' className="w-full border border-red-200 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/20" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} disabled={isWiping} />
                                    <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold" disabled={confirmText.trim().toUpperCase() !== 'CONFIRM' || isWiping} onClick={handleWipe}>
                                        <Trash2 className="w-4 h-4 mr-2" /> {isWiping ? 'Wiping...' : 'Permanently Delete All Orders'}
                                    </Button>
                                </div>
                            )}
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => { setIsResetOpen(false); setConfirmText(''); }} disabled={isWiping}>Cancel</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:gap-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-lg ${printerEnabled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                <Printer className={`w-5 h-5 ${printerEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800 text-sm sm:text-base">Receipt Printing</h3>
                                <p className="text-xs sm:text-sm text-slate-500">
                                    {printerEnabled ? 'Bills will be printed after each order' : 'Orders will complete without printing'}
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={printerEnabled}
                            onCheckedChange={togglePrinter}
                            className="data-[state=checked]:bg-emerald-500"
                        />
                    </div>
                    
                    <div className="w-full h-px bg-slate-100" />
                    
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-lg ${kitchenPrinterEnabled ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                                <Printer className={`w-5 h-5 ${kitchenPrinterEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800 text-sm sm:text-base">KOT Printing</h3>
                                <p className="text-xs sm:text-sm text-slate-500">
                                    {kitchenPrinterEnabled ? 'Kitchen tickets will pair to bluetooth after billing' : 'Orders sent without kitchen BT printing'}
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={kitchenPrinterEnabled}
                            onCheckedChange={toggleKitchenPrinter}
                            className="data-[state=checked]:bg-emerald-500"
                        />
                    </div>
                    
                    <div className="w-full h-px bg-slate-100" />
                    
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                            <Label className="text-sm font-semibold text-slate-800">Hotel Name</Label>
                            <Input 
                                value={hotelName} 
                                onChange={(e) => setHotelName(e.target.value)} 
                                placeholder="e.g. THE PLAYROOM SALEM"
                                className="font-mono text-sm"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-sm font-semibold text-slate-800">Hotel Address</Label>
                            <Input 
                                value={hotelAddress} 
                                onChange={(e) => setHotelAddress(e.target.value)} 
                                placeholder="e.g. kondalampatty About round salem"
                                className="font-mono text-xs"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">This information will appear at the top of printed receipts.</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-sm font-semibold text-slate-800">Printer Paper Size</Label>
                            <Select value={printerPaperSize} onValueChange={(val: '58mm' | '80mm') => setPrinterPaperSize(val)}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="Select paper size" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="58mm">58mm (Narrow)</SelectItem>
                                    <SelectItem value="80mm">80mm (Wide)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-slate-500 mt-1">Adjusts the text wrapping and dashed lines for standard thermal printers.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Menu Management */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-6 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Menu Management</h2>
                    <p className="text-slate-500 text-xs sm:text-sm">Add or modify items, update pricing, and toggle availability.</p>
                </div>

                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-slate-800 hover:bg-slate-900 text-white text-sm w-full sm:w-auto">
                            <Plus className="w-4 h-4 mr-2" /> Add New Item
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px] w-[calc(100vw-2rem)]">
                        <DialogHeader>
                            <DialogTitle>Add Menu Item</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleAddItem} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Item Name</Label>
                                <Input id="name" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. Garlic Bread" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Category</Label>
                                <Input id="category" value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)} placeholder="e.g. Starters" required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="price">Price (₹)</Label>
                                <Input id="price" type="number" step="0.01" min="0" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} placeholder="e.g. 4.99" required />
                            </div>
                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">Save Item</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md overflow-x-auto scrollbar-hide">
                <Table className="min-w-[500px]">
                    <TableHeader className="bg-slate-50 sticky top-0">
                        <TableRow>
                            <TableHead className="font-semibold text-slate-700 text-xs sm:text-sm">Item Name</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-xs sm:text-sm">Category</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-xs sm:text-sm">Price</TableHead>
                            <TableHead className="font-semibold text-slate-700 text-xs sm:text-sm w-[100px] sm:w-[150px] text-center">In Stock</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {menuItems.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium text-slate-800 text-xs sm:text-sm">{item.name}</TableCell>
                                <TableCell className="text-slate-500 text-xs sm:text-sm">{item.category}</TableCell>
                                <TableCell className="text-slate-800 text-xs sm:text-sm">₹{Number(item.price).toFixed(2)}</TableCell>
                                <TableCell className="text-center">
                                    <Switch
                                        checked={item.is_available}
                                        onCheckedChange={() => toggleMenuItemAvailability(item.id)}
                                        className="data-[state=checked]:bg-emerald-500"
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                        {menuItems.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                                    No menu items found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
        </div>
    );
}
