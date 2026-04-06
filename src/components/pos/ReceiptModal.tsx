'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OrderItem } from '@/lib/types';
import { Printer, Bluetooth, BluetoothOff } from 'lucide-react';
import { useState, useCallback } from 'react';

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void;
    items: OrderItem[];
    total: number;
    orderType: string;
    paymentMethod: string;
    hotelName: string;
    hotelAddress: string;
    token?: string;
    printerPaperSize: '58mm' | '80mm';
}

// ─── ESC/POS Command Helpers ─────────────────────────────────────────────────
const ESC = 0x1B;
const GS = 0x1D;

function textToBytes(text: string): number[] {
    // Replace ₹ with Rs. because thermal printers don't support Unicode
    const safeText = text.replace(/₹/g, 'Rs.');
    return Array.from(new TextEncoder().encode(safeText));
}

// ─── Logo → ESC/POS Bitmap ──────────────────────────────────────────────────
async function loadLogoBitmap(): Promise<number[]> {
    try {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.src = '/logo.png';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to load logo'));
        });

        // Scale to fit 384px width (standard 58mm thermal printer)
        const PRINT_WIDTH = 384;
        const scale = PRINT_WIDTH / img.width;
        const w = PRINT_WIDTH;
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const pixels = imageData.data;

        // Convert to ESC/POS raster bit-image (GS v 0)
        const bytesPerRow = Math.ceil(w / 8);
        const commands: number[] = [];

        // GS v 0 m xL xH yL yH
        commands.push(GS, 0x76, 0x30, 0x00);
        commands.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF);
        commands.push(h & 0xFF, (h >> 8) & 0xFF);

        for (let y = 0; y < h; y++) {
            for (let byteX = 0; byteX < bytesPerRow; byteX++) {
                let byte = 0;
                for (let bit = 0; bit < 8; bit++) {
                    const x = byteX * 8 + bit;
                    if (x < w) {
                        const idx = (y * w + x) * 4;
                        const r = pixels[idx];
                        const g = pixels[idx + 1];
                        const b = pixels[idx + 2];
                        // Convert to grayscale; dark pixels = 1 (print)
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        if (gray < 128) {
                            byte |= (0x80 >> bit);
                        }
                    }
                }
                commands.push(byte);
            }
        }

        // Feed a little after the image
        commands.push(...textToBytes('\n'));
        return commands;
    } catch (err) {
        console.warn('[Print] Could not load logo for thermal print:', err);
        return [];
    }
}

async function buildReceiptBytes(items: OrderItem[], total: number, orderType: string, paymentMethod: string, hotelName: string, hotelAddress: string, printerPaperSize: '58mm' | '80mm', token?: string): Promise<Uint8Array> {
    const commands: number[] = [];
    const date = new Date().toLocaleString();
    const is80mm = printerPaperSize === '80mm';
    const hr = is80mm ? '-'.repeat(48) + '\n' : '-'.repeat(32) + '\n';

    // Initialize printer
    commands.push(ESC, 0x40); // ESC @ (initialize)

    // Center align
    commands.push(ESC, 0x61, 0x01); // ESC a 1 (center)

    // Print logo — removed per user request

    // Bold + Double height for header (NOT double width — would overflow 58mm)
    commands.push(ESC, 0x45, 0x01); // ESC E 1 (bold on)
    commands.push(GS, 0x21, 0x10); // GS ! 0x10 (double height only, bit4=height)
    commands.push(...textToBytes(`${hotelName.toUpperCase()}\n`));
    commands.push(GS, 0x21, 0x10); // Double height only for order type
    commands.push(...textToBytes(`** ${orderType.replace('_', ' ').toUpperCase()} **\n`));

    if (token) {
        commands.push(GS, 0x21, 0x10); // double height only
        commands.push(...textToBytes(`TOKEN: ${token}\n`));
    }

    commands.push(GS, 0x21, 0x00); // GS ! 0x00 (normal size)
    commands.push(ESC, 0x45, 0x00); // ESC E 0 (bold off)

    // Address
    const addressLines = hotelAddress.split('\n');
    addressLines.forEach(line => {
        if (line.trim()) commands.push(...textToBytes(`${line.trim()}\n`));
    });

    commands.push(...textToBytes(`${date}\n`));
    commands.push(...textToBytes(hr));

    // Left align for items
    commands.push(ESC, 0x61, 0x00); // ESC a 0 (left)

    for (const item of items) {
        const itemTotal = (item.price * item.quantity).toFixed(2);
        const nameLine = `${item.name}\n`;
        const qtyPriceLine = `  ${item.quantity} x Rs.${Number(item.price).toFixed(2)}`;
        const amountLine = `Rs.${itemTotal}`;

        const spacesRequired = (is80mm ? 48 : 32) - qtyPriceLine.length - amountLine.length;
        const spaces = Math.max(0, spacesRequired);
        const paddedQtyPriceLine = `${qtyPriceLine}${' '.repeat(spaces)}${amountLine}\n`;

        // Print item name
        commands.push(...textToBytes(nameLine));
        // Print quantity, price and amount
        commands.push(...textToBytes(paddedQtyPriceLine));
    }

    // Total and Payment
    commands.push(...textToBytes(hr));
    commands.push(GS, 0x21, 0x10); // double height only (bit4=height)
    commands.push(ESC, 0x45, 0x01); // bold on
    const totalLine = `TOTAL: ₹${total.toFixed(2)}`;
    commands.push(ESC, 0x61, 0x02); // right align
    commands.push(...textToBytes(`${totalLine}\n`));
    commands.push(GS, 0x21, 0x00); // normal size
    commands.push(ESC, 0x45, 0x00); // bold off

    // Center for footer
    commands.push(ESC, 0x61, 0x01); // center
    commands.push(GS, 0x21, 0x00);
    commands.push(ESC, 0x45, 0x00);
    commands.push(...textToBytes(`PAID VIA: ${paymentMethod.toUpperCase()}\n`));
    commands.push(...textToBytes(hr));

    commands.push(ESC, 0x61, 0x01); // center
    commands.push(...textToBytes('*** THANK YOU ***\n=================\n\n\n\n\n'));

    // Cut paper
    commands.push(GS, 0x56, 0x00); // GS V 0 (full cut)

    return new Uint8Array(commands);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ReceiptModal({ isOpen, onClose, onComplete, items, total, orderType, paymentMethod, hotelName, hotelAddress, printerPaperSize, token }: ReceiptModalProps) {
    const date = new Date().toLocaleString();
    const [btDevice, setBtDevice] = useState<BluetoothDevice | null>(null);
    const [btCharacteristic, setBtCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);
    const [btStatus, setBtStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

    const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

    const connectPrinter = useCallback(async () => {
        if (!hasBluetooth) return;
        setBtStatus('connecting');
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
            });

            const server = await device.gatt!.connect();
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

            setBtDevice(device);
            setBtCharacteristic(characteristic);
            setBtStatus('connected');
        } catch (err: any) {
            // User cancelled the chooser dialog — not an error
            if (err?.name === 'NotFoundError') {
                setBtStatus('disconnected');
                return;
            }
            console.error('[BT] Connection failed:', err);
            setBtStatus('disconnected');
        }
    }, [hasBluetooth]);

    const handlePrint = async () => {
        if (btStatus === 'connected' && btCharacteristic) {
            // Generate bytes first while items are still valid
            const receiptBytes = await buildReceiptBytes(items, total, orderType, paymentMethod, hotelName, hotelAddress, printerPaperSize, token);

            // 1. Order completed and stored into DB
            onComplete();

            // 2. Then bill should be printed
            try {
                const CHUNK_SIZE = 20;
                for (let i = 0; i < receiptBytes.length; i += CHUNK_SIZE) {
                    const chunk = receiptBytes.slice(i, i + CHUNK_SIZE);
                    await btCharacteristic.writeValue(chunk);
                }
            } catch (err) {
                console.error('[BT] Print failed', err);
            }
        } else {
            // Fallback: browser window.print()
            setTimeout(() => {
                window.print();
                onComplete();
            }, 100);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={`print-receipt w-full ${printerPaperSize === '80mm' ? 'max-w-[420px]' : 'max-w-[320px]'} bg-white text-black font-mono max-h-[95vh] border-none overflow-y-auto p-4 mx-auto rounded-none sm:rounded-lg`}>
                <DialogHeader>
                    <DialogTitle className="text-center font-bold text-xl sm:text-2xl border-b-2 border-dashed border-neutral-400 pb-2 sm:pb-3 mb-1 text-black">
                        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-1 break-words px-4 leading-tight">
                            <span className="text-black uppercase">{hotelName}</span>
                        </div>
                        <div className="text-sm font-black mt-2 bg-neutral-100 py-1.5 rounded-md uppercase tracking-wider text-black">
                            {orderType.replace('_', ' ')}
                            {token && ` • TOKEN: ${token}`}
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center mb-3 sm:mb-4 px-2">
                    {hotelAddress.split('\n').map((line, i) => (
                        <p key={i} className="text-[10px] sm:text-xs text-neutral-600 text-center leading-tight">{line}</p>
                    ))}
                    <p className="text-[10px] sm:text-xs text-neutral-600 mt-1">{date}</p>
                </div>

                <ScrollArea className="max-h-[30vh] sm:max-h-[35vh] mb-3 sm:mb-4">
                    <div className="space-y-2 sm:space-y-3">
                        <div className="flex justify-between text-xs font-bold border-b border-neutral-300 pb-1 text-black">
                            <span>ITEM</span>
                            <span>AMT</span>
                        </div>
                        {items.map(item => (
                            <div key={item.id} className="text-xs sm:text-sm text-black">
                                <div className="flex justify-between">
                                    <span className="uppercase pr-4 leading-tight font-medium">{item.name}</span>
                                    <span className="font-semibold">₹{(item.price * item.quantity).toFixed(2)}</span>
                                </div>
                                <div className="text-[10px] sm:text-xs text-neutral-500 mt-0.5 sm:mt-0">
                                    {item.quantity} x ₹{Number(item.price).toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <div className="border-t-2 border-dashed border-neutral-400 pt-2 sm:pt-3 mb-3 sm:mb-4">
                    <div className="flex justify-between text-lg sm:text-xl font-bold text-black">
                        <span>TOTAL:</span>
                        <span>₹{total.toFixed(2)}</span>
                    </div>
                </div>

                <div className="text-center space-y-0.5 sm:space-y-1 mb-3 sm:mb-4 flex flex-col items-center">
                    <p className="text-xs sm:text-sm font-bold uppercase text-black">PAID VIA: {paymentMethod}</p>
                    <p className="text-[10px] sm:text-xs text-neutral-600 font-bold mt-1 sm:mt-2">*** THANK YOU ***</p>
                </div>

                <div className="space-y-2 print-hidden shrink-0">
                    {hasBluetooth && (
                        <Button
                            variant="outline"
                            className="w-full h-8 sm:h-10 text-xs sm:text-sm"
                            onClick={connectPrinter}
                            disabled={btStatus === 'connected'}
                        >
                            {btStatus === 'connected' ? (
                                <>
                                    <Bluetooth className="w-4 h-4 mr-2 text-blue-500" />
                                    Printer Connected
                                </>
                            ) : btStatus === 'connecting' ? (
                                <>
                                    <Bluetooth className="w-4 h-4 mr-2 animate-pulse" />
                                    Connecting...
                                </>
                            ) : (
                                <>
                                    <BluetoothOff className="w-4 h-4 mr-2" />
                                    Connect Bluetooth Printer
                                </>
                            )}
                        </Button>
                    )}

                    <Button onClick={handlePrint} className="print-hidden w-full h-10 sm:h-12 text-base sm:text-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Printer className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                        {btStatus === 'connected' ? 'Print via Bluetooth' : 'Print & Complete Order'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
