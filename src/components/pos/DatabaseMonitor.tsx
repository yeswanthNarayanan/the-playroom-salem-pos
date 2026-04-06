'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePOSStore } from '@/store/pos-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Download, Trash2, CheckCircle2 } from 'lucide-react';

// 500MB Limit -> 90% is 450MB
const MAX_BYTES = 500 * 1024 * 1024;
const WARNING_THRESHOLD_BYTES = 450 * 1024 * 1024;

export default function DatabaseMonitor() {
    const isOnline = usePOSStore(state => state.isOnline);
    const clearCompletedOrders = usePOSStore(state => state.clearCompletedOrders);

    const [dbSize, setDbSize] = useState<number | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isWiping, setIsWiping] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [wipeSuccess, setWipeSuccess] = useState(false);

    useEffect(() => {
        if (!isOnline) return;

        const checkDbSize = async () => {
            try {
                const { data, error } = await supabase.rpc('get_db_size_bytes');
                if (error) {
                    console.error('Failed to get database size. RPC might be missing:', error);
                    return;
                }
                
                if (data !== null) {
                    const size = Number(data);
                    setDbSize(size);
                    
                    if (size >= WARNING_THRESHOLD_BYTES) {
                        const hasSeenWarning = sessionStorage.getItem('db_warning_seen');
                        if (!hasSeenWarning) {
                            setIsOpen(true);
                            sessionStorage.setItem('db_warning_seen', 'true');
                        }
                    }
                }
            } catch (err) {
                console.error('DB Size Check Error:', err);
            }
        };

        checkDbSize();
        const interval = setInterval(checkDbSize, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isOnline]);

    const handleExportAll = async () => {
        setIsExporting(true);
        try {
            let allOrders: any[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('orders')
                    .select('id, total, created_at, order_type, payment_method')
                    .range(from, from + limit - 1)
                    .order('created_at', { ascending: false });

                if (error || !data || data.length === 0) {
                    hasMore = false;
                } else {
                    allOrders.push(...data);
                    from += limit;
                    if (data.length < limit) hasMore = false;
                }
            }

            if (allOrders.length === 0) {
                alert('No orders found to export.');
                setIsExporting(false);
                return;
            }

            let csvContent = "Order ID,Date,Time,Order Type,Payment Method,Total Amount (INR)\n";
            
            allOrders.forEach(order => {
                const dateObj = new Date(order.created_at || order.timestamp);
                const dateStr = dateObj.toLocaleDateString();
                const timeStr = dateObj.toLocaleTimeString();
                const type = (order.order_type || 'Takeaway').replace('_', ' ').toUpperCase();
                const method = (order.payment_method || 'Cash').toUpperCase();
                const total = Number(order.total).toFixed(2);
                
                csvContent += `"${order.id}","${dateStr}","${timeStr}","${type}","${method}","${total}"\n`;
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `spicy_queen_FULL_DB_BACKUP_${new Date().getTime()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
        } catch (err) {
            console.error('Export Failed:', err);
            alert('Export failed. Check console for details.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleWipeDatabase = async () => {
        if (confirmText.trim().toUpperCase() !== 'CONFIRM') return;
        
        setIsWiping(true);
        try {
            const { error } = await supabase.rpc('reset_business_data');
            
            if (error) {
                console.error('Wipe failed:', error);
                alert('Failed to wipe database: ' + error.message);
                return;
            }

            clearCompletedOrders();
            setWipeSuccess(true);
            setDbSize(0);
            
            setTimeout(() => {
                setIsOpen(false);
                setWipeSuccess(false);
                setConfirmText('');
            }, 3000);
            
        } catch (err) {
            console.error('Wipe Error:', err);
            alert('A network error occurred while wiping.');
        } finally {
            setIsWiping(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-md w-[95vw] border-red-200 shadow-xl shadow-red-500/10">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-red-600">
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        Database Capacity Warning
                    </DialogTitle>
                    <DialogDescription className="text-slate-600">
                        Your Supabase free tier database is reaching its maximum limit of 500MB! 
                        <br/><br/>
                        <strong>Current Size:</strong> {dbSize ? (dbSize / (1024 * 1024)).toFixed(2) : '--'} MB / 500 MB
                        <br/>
                        <span className="block w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                            <span 
                                className={`block h-full ${dbSize && dbSize >= WARNING_THRESHOLD_BYTES ? 'bg-red-500' : 'bg-amber-500'}`} 
                                style={{ width: `${Math.min(100, (dbSize || 0) / MAX_BYTES * 100)}%` }} 
                            />
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2 space-y-4 border-t border-b border-slate-100 my-2">
                    {wipeSuccess ? (
                        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg flex items-center justify-center flex-col text-center">
                            <CheckCircle2 className="w-8 h-8 mb-2" />
                            <p className="font-bold">Database Wiped Successfully!</p>
                            <p className="text-xs mt-1">Starting fresh...</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-slate-800">1. Backup Your Data</h4>
                                <Button 
                                    variant="outline" 
                                    className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                    onClick={handleExportAll}
                                    disabled={isExporting || isWiping}
                                >
                                    <Download className={`w-4 h-4 mr-2 ${isExporting ? 'animate-bounce' : ''}`} />
                                    {isExporting ? 'Generating Large CSV...' : 'Export Complete History (CSV)'}
                                </Button>
                                <p className="text-[10px] text-slate-500 text-center">
                                    Downloads all active orders to a CSV file.
                                </p>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-red-100">
                                <h4 className="text-sm font-semibold text-red-700">2. Emergency Reset</h4>
                                <p className="text-xs text-red-500/80 mb-2">
                                    This will irrevocably delete ALL ORDERS from the database, giving you a completely fresh start.
                                </p>
                                <div className="space-y-2">
                                    <input 
                                        type="text" 
                                        placeholder='Type CONFIRM here' 
                                        className="w-full border border-red-200 rounded-md px-3 py-2 text-sm focus:ring-red-500 focus:border-red-500 outline-none"
                                        value={confirmText}
                                        onChange={(e) => setConfirmText(e.target.value)}
                                        disabled={isWiping}
                                    />
                                    <Button 
                                        variant="default"
                                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"
                                        disabled={confirmText.trim().toUpperCase() !== 'CONFIRM' || isWiping || isExporting}
                                        onClick={handleWipeDatabase}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        {isWiping ? 'Wiping Database...' : 'Permanently Delete All Orders'}
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isWiping}>
                        Dismiss for now
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
