import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OrderItem } from '@/lib/types';
import { Printer, Bluetooth, Check, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { isGameCategory } from '@/lib/constants';
import { usePOSStore } from '@/store/pos-store';

interface KitchenReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: OrderItem[];
    orderType: string;
    token?: string;
    onComplete: () => void;
    /** Map of itemId → prepared quantity (same source the KDS uses) */
    preparedItems?: Record<string, number>;
    hotelName: string;
    hotelAddress: string;
    printerPaperSize: '58mm' | '80mm';
}

const ESC = 0x1b;
const GS = 0x1d;

function textToBytes(text: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
        bytes.push(text.charCodeAt(i));
    }
    return bytes;
}

export function buildKitchenReceiptBytes(
    items: OrderItem[],
    orderType: string,
    token: string | undefined,
    preparedItems: Record<string, number> | undefined,
    hotelName: string = '',
    hotelAddress: string = '',
    printerPaperSize: '58mm' | '80mm' = '58mm',
    menuItemsList?: { id: string; name: string; category: string }[]
): Uint8Array {
    // Filter out game items if menuItemsList is provided
    let filteredItems = items;
    if (menuItemsList && menuItemsList.length > 0) {
        const catLookup: Record<string, string> = {};
        menuItemsList.forEach(mi => { 
            catLookup[mi.id] = mi.category; 
            catLookup[mi.name.toLowerCase()] = mi.category;
        });
        filteredItems = items.filter(item => {
            const cat = catLookup[item.id] || catLookup[item.name.toLowerCase()] || '';
            return !isGameCategory(cat);
        });
    }
    const commands: number[] = [];
    const date = new Date().toLocaleString();
    const prep = preparedItems || {};
    const is80mm = printerPaperSize === '80mm';
    const cols = is80mm ? 48 : 32;
    const hr = '-'.repeat(cols) + '\n';

    // Helper: pad/truncate a line to fit columns
    const padLine = (left: string, right: string) => {
        const space = cols - left.length - right.length;
        return left + ' '.repeat(Math.max(1, space)) + right + '\n';
    };

    // Reset printer
    commands.push(ESC, 0x40);

    // ── Header: KOT title (double height only, NOT double width) ──
    commands.push(ESC, 0x61, 0x01); // center
    commands.push(ESC, 0x45, 0x01); // bold
    commands.push(GS, 0x21, 0x10); // double height only (bit 4 = height)
    commands.push(...textToBytes('** KOT **\n'));
    commands.push(GS, 0x21, 0x00); // normal size
    commands.push(ESC, 0x45, 0x00); // bold off

    // Order type + date (bold + double height for order type, normal for date)
    commands.push(ESC, 0x45, 0x01); // bold
    commands.push(GS, 0x21, 0x10); // double height only (bit 4 = height)
    commands.push(...textToBytes(`${orderType.toUpperCase()}${token ? ` | TOKEN: ${token}` : ''}\n`));
    commands.push(GS, 0x21, 0x00); // normal size
    commands.push(ESC, 0x45, 0x00); // bold off
    commands.push(...textToBytes(`${date}\n`));
    commands.push(...textToBytes(hr));

    // Left align for items
    commands.push(ESC, 0x61, 0x00);

    // Split items using preparedItems
    const newItems: { name: string; qty: number }[] = [];
    const servedItems: { name: string; qty: number }[] = [];

    filteredItems.forEach(item => {
        const prepQty = Math.min(item.quantity, prep[item.id] || 0);
        const newQty = item.quantity - prepQty;
        if (newQty > 0) newItems.push({ name: item.name, qty: newQty });
        if (prepQty > 0) servedItems.push({ name: item.name, qty: prepQty });
    });

    // ── NEW ITEMS (bold, normal size) ──
    if (newItems.length > 0) {
        commands.push(ESC, 0x61, 0x01); // center
        commands.push(ESC, 0x45, 0x01); // bold
        commands.push(...textToBytes('=== NEW ITEMS ===\n'));
        commands.push(ESC, 0x45, 0x00); // bold off
        commands.push(ESC, 0x61, 0x00); // left

        // Column header
        commands.push(...textToBytes(padLine('QTY  ITEM', '')));
        commands.push(...textToBytes(hr));

        // Each item: bold, normal size
        newItems.forEach(row => {
            commands.push(ESC, 0x45, 0x01); // bold
            const qtyStr = `${row.qty}x`;
            const nameStr = row.name.toUpperCase();
            // Truncate name if needed to fit one line
            const maxNameLen = cols - qtyStr.length - 3;
            const truncName = nameStr.length > maxNameLen ? nameStr.substring(0, maxNameLen) : nameStr;
            commands.push(...textToBytes(`${qtyStr}   ${truncName}\n`));
            commands.push(ESC, 0x45, 0x00); // bold off
        });

        commands.push(...textToBytes('\n'));
    }

    // ── ALREADY SERVED (normal, smaller feel) ──
    if (servedItems.length > 0) {
        commands.push(...textToBytes(hr));
        commands.push(ESC, 0x61, 0x01); // center
        commands.push(...textToBytes('ALREADY SERVED\n'));
        commands.push(ESC, 0x61, 0x00); // left
        commands.push(...textToBytes(hr));

        servedItems.forEach(row => {
            const line = `[X] ${row.qty}x  ${row.name.toUpperCase()}`;
            const truncLine = line.length > cols ? line.substring(0, cols) : line;
            commands.push(...textToBytes(truncLine + '\n'));
        });
        commands.push(...textToBytes('\n'));
    }

    // Footer
    commands.push(...textToBytes(hr + '\n\n\n'));

    // Cut paper
    commands.push(GS, 0x56, 0x00);

    return new Uint8Array(commands);
}

export default function KitchenReceiptModal({
    isOpen,
    onClose,
    items,
    orderType,
    token,
    onComplete,
    preparedItems,
    hotelName,
    hotelAddress,
    printerPaperSize
}: KitchenReceiptModalProps) {
    const [btStatus, setBtStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [printerDevice, setPrinterDevice] = useState<BluetoothDevice | null>(null);
    const [isWarningOpen, setIsWarningOpen] = useState(false);
    const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
    const prep = preparedItems || {};

    // Get menu items to filter out games
    const menuItemsFromStore = usePOSStore(state => state.menuItems);
    const catLookup: Record<string, string> = {};
    menuItemsFromStore.forEach(mi => { 
        catLookup[mi.id] = mi.category; 
        catLookup[mi.name.toLowerCase()] = mi.category;
    });

    // Filter out game items from display
    const nonGameItems = items.filter(item => {
        const cat = catLookup[item.id] || catLookup[item.name.toLowerCase()] || '';
        return !isGameCategory(cat);
    });

    const handleSkipWarningConfirm = () => {
        setIsWarningOpen(false);
        onComplete();
    };

    const connectPrinter = async () => {
        if (!hasBluetooth) return;
        setBtStatus('connecting');
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
            });
            setPrinterDevice(device);
            setBtStatus('connected');
        } catch {
            setBtStatus('error');
        }
    };

    const handlePrint = async () => {
        try {
            if (btStatus === 'connected' && printerDevice) {
                const server = await printerDevice.gatt?.connect();
                const service = await server?.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
                const characteristic = await service?.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

                const bytes = buildKitchenReceiptBytes(items, orderType, token, prep, hotelName, hotelAddress, printerPaperSize, menuItemsFromStore);

                // Mobile/tablet BLE has ~20 byte MTU; large chunks get silently dropped
                const CHUNK_SIZE = 20;
                for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
                    const chunk = bytes.slice(i, i + CHUNK_SIZE);
                    await characteristic?.writeValue(chunk);
                    // Small delay to prevent buffer overflow on mobile devices
                    if (i + CHUNK_SIZE < bytes.length) {
                        await new Promise(r => setTimeout(r, 50));
                    }
                }
                // Keep connection alive — do NOT disconnect
            } else {
                if (orderType === 'takeaway' || orderType === 'delivery') {
                    setIsWarningOpen(true);
                    return;
                }
            }
            onComplete();
        } catch (err) {
            console.error(err);
            onComplete();
        }
    };

    // ── Build rows using preparedItems (identical logic to KDS) ──
    const newRows: { name: string; qty: number; id: string }[] = [];
    const servedRows: { name: string; qty: number; id: string }[] = [];

    nonGameItems.forEach(item => {
        const prepQty = Math.min(item.quantity, prep[item.id] || 0);
        const newQty = item.quantity - prepQty;
        if (prepQty > 0) servedRows.push({ name: item.name, qty: prepQty, id: `${item.id}-served` });
        if (newQty > 0) newRows.push({ name: item.name, qty: newQty, id: `${item.id}-new` });
    });

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={`print-receipt w-full ${printerPaperSize === '80mm' ? 'max-w-[420px]' : 'max-w-[320px]'} bg-white text-black font-mono max-h-[95vh] border-none overflow-y-auto p-4 mx-auto rounded-none sm:rounded-lg`}>
                {/* ── Receipt Header ── */}
                <DialogHeader>
                    <DialogTitle className="text-center font-bold text-xl sm:text-2xl border-b-2 border-dashed border-neutral-400 pb-2 sm:pb-3 mb-1 text-black">
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <span className="text-black">** KOT **</span>
                        </div>
                        <div className="text-sm font-black mt-2 bg-neutral-100 py-1.5 rounded-md uppercase tracking-wider text-black">
                            {orderType.replace(/_/g, ' ')}
                            {token && ` • TOKEN: ${token}`}
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center mb-3">
                    <p className="text-[10px] sm:text-xs text-neutral-600">{new Date().toLocaleString()}</p>
                </div>

                <ScrollArea className="max-h-[50vh] mb-3">
                    {/* ── NEW ITEMS SECTION ── */}
                    {newRows.length > 0 && (
                        <div className="mb-4">
                            <div className="text-center text-xs font-black text-black border-y border-dashed border-neutral-400 py-1 mb-2 tracking-widest">
                                🔥 NEW ITEMS TO COOK
                            </div>
                            <div className="flex justify-between text-xs font-bold border-b border-neutral-300 pb-1 text-black mb-1">
                                <span>QTY</span>
                                <span>ITEM</span>
                            </div>
                            {newRows.map((row) => (
                                <div key={row.id} className="flex justify-between items-center text-sm sm:text-base py-1.5 border-b border-neutral-100 text-black">
                                    <span className="font-black text-lg sm:text-xl min-w-[3rem] text-center">{row.qty}x</span>
                                    <span className="uppercase font-bold flex-1 text-right tracking-tight">{row.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── SERVED ITEMS SECTION ── */}
                    {servedRows.length > 0 && (
                        <div>
                            <div className="text-center text-xs font-bold text-neutral-400 border-y border-dashed border-neutral-300 py-1 mb-2 tracking-widest">
                                ALREADY SERVED (DO NOT COOK)
                            </div>
                            <div className="flex justify-between text-[10px] font-bold border-b border-neutral-200 pb-1 text-neutral-400 mb-1">
                                <span>QTY</span>
                                <span>ITEM</span>
                            </div>
                            {servedRows.map((row) => (
                                <div key={row.id} className="flex justify-between items-center text-xs sm:text-sm py-1 border-b border-neutral-100 text-neutral-400 line-through decoration-neutral-400 decoration-2">
                                    <span className="font-bold min-w-[3rem] text-center">{row.qty}x</span>
                                    <span className="uppercase font-medium flex-1 text-right italic">{row.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                {/* ── Footer ── */}

                {/* ── Print Controls ── */}
                <div className="space-y-2 print-hidden shrink-0">
                    {hasBluetooth && (
                        <Button
                            variant="outline"
                            className="w-full h-8 sm:h-10 text-xs sm:text-sm"
                            onClick={connectPrinter}
                            disabled={btStatus === 'connected'}
                        >
                            {btStatus === 'connected' ? (
                                <><Check className="w-4 h-4 mr-2 text-emerald-500" /> Kitchen Printer Ready</>
                            ) : btStatus === 'connecting' ? (
                                <><div className="w-4 h-4 mr-2 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin"></div> Connecting...</>
                            ) : (
                                <><Bluetooth className="w-4 h-4 mr-2 text-slate-400" /> Connect Kitchen Printer</>
                            )}
                        </Button>
                    )}

                    <Button onClick={handlePrint} className={`print-hidden w-full h-11 text-base font-black shadow-lg shadow-black/10 active:scale-[0.98] transition-all ${btStatus === 'connected' ? 'bg-black hover:bg-neutral-800' : 'bg-slate-800 hover:bg-slate-900'
                        } text-white`}>
                        <Printer className="w-5 h-5 mr-2" />
                        {btStatus === 'connected' ? 'PRINT KOT' : 'SKIP & CONTINUE'}
                    </Button>
                </div>
            </DialogContent>

            {/* Nested Warning Dialog */}
            <Dialog open={isWarningOpen} onOpenChange={setIsWarningOpen}>
                <DialogContent className="sm:max-w-md w-[95vw] bg-white text-slate-800 border border-amber-200 shadow-xl shadow-amber-900/10">
                    <DialogHeader>
                        <DialogTitle className="flex items-center text-amber-600 text-lg">
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            Kitchen Printer NOT Connected
                        </DialogTitle>
                        <DialogDescription asChild className="text-slate-600 pt-2 space-y-3">
                            <div>
                                <div className="font-medium text-slate-700">
                                    Are you sure you want to <strong>skip KOT printing</strong> and complete the order?
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <ul className="list-disc pl-4 text-xs space-y-2 text-slate-500">
                                        <li>If you need KOTs, click <strong>Cancel</strong> and connect the printer.</li>
                                        <li>If you never use KOTs for takeaways, you can turn off <span className="font-semibold">KOT Printing</span> in Admin Settings to avoid this popup in the future.</li>
                                    </ul>
                                </div>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2 sm:gap-2 flex-col sm:flex-row gap-2">
                        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setIsWarningOpen(false)}>
                            Cancel
                        </Button>
                        <Button className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white font-bold" onClick={handleSkipWarningConfirm}>
                            Skip and Complete Order
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}
