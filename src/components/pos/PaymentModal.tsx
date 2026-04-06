'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { X, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { usePOSStore } from '@/store/pos-store';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (splitData: { cash: number; upi: number }) => void;
    total: number;
    paymentMethod: 'cash' | 'split' | 'upi';
}

export default function PaymentModal({ isOpen, onClose, onComplete, total, paymentMethod }: PaymentModalProps) {
    const [cashStr, setCashStr] = useState('');
    const [upiStr, setUpiStr] = useState('');
    const { printerEnabled, togglePrinter } = usePOSStore();

    const handleCashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const parts = val.split('.');
        if (parts.length > 2) {
            val = parts[0] + '.' + parts.slice(1).join('');
        }
        setCashStr(val);

        if (val !== '') {
            const parsedCash = parseFloat(val) || 0;
            if (parsedCash < total) {
                setUpiStr((total - parsedCash).toFixed(2).replace(/\.00$/, ''));
            } else {
                setUpiStr('');
            }
        }
    };

    const handleUpiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const parts = val.split('.');
        if (parts.length > 2) {
            val = parts[0] + '.' + parts.slice(1).join('');
        }
        setUpiStr(val);

        if (val !== '') {
            const parsedUpi = parseFloat(val) || 0;
            if (parsedUpi < total) {
                setCashStr((total - parsedUpi).toFixed(2).replace(/\.00$/, ''));
            } else {
                setCashStr('');
            }
        }
    };

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setCashStr('');
            setUpiStr('');
            
            if (paymentMethod === 'cash') {
                setCashStr(total.toString());
            } else if (paymentMethod === 'upi') {
                setUpiStr(total.toString());
            }
        }
    }, [isOpen, paymentMethod, total]);

    const cashAmt = parseFloat(cashStr) || 0;
    const upiAmt = parseFloat(upiStr) || 0;
    const received = cashAmt + upiAmt;

    // Only valid if received is equal to or greater than total
    const isValid = received >= total;

    const amtToReturnOrPending = Math.abs(received - total);
    const balanceLabel = received >= total ? 'Change Due' : 'Pending';

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl p-0 overflow-hidden bg-slate-50 gap-0 border-0 shadow-2xl sm:rounded-2xl text-slate-800 [&>button]:hidden h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col">
                <DialogTitle className="sr-only">Complete Payment</DialogTitle>
                
                {/* Header Navbar - Fixed at top */}
                <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 h-14 sm:h-16 shrink-0 z-20">
                    <button onClick={onClose} className="p-2 -ml-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                    <span className="font-bold text-slate-800 text-lg sm:text-xl">Payment Details</span>
                </div>

                {/* SCROLLING MIDDLE SECTION */}
                <div className="flex-1 overflow-y-auto w-full p-4 sm:p-6 lg:p-8 relative">
                    <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8 pb-4">
                        
                        {/* Bill Total Card */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex flex-col items-center justify-center">
                            <span className="text-slate-500 font-semibold text-xs sm:text-sm uppercase tracking-widest mb-1 sm:mb-2">Bill Total</span>
                            <span className="text-5xl sm:text-6xl font-black text-slate-800">₹{total.toFixed(2)}</span>
                        </div>

                        {/* Split Inputs Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                            
                            {/* Cash Box */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                                <label className="block text-xs sm:text-sm font-bold text-slate-600 mb-3 uppercase tracking-wide">Cash Received</label>
                                <div className="flex items-center h-14 sm:h-16 bg-slate-50 border-2 border-slate-200 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-500/10 rounded-xl transition-all overflow-hidden px-4">
                                    <span className="text-xl sm:text-2xl text-slate-400 font-semibold mr-2">₹</span>
                                    <input 
                                        type="text" 
                                        inputMode="decimal"
                                        value={cashStr}
                                        onChange={handleCashChange}
                                        placeholder="0"
                                        className="flex-1 h-full bg-transparent border-0 outline-none focus:ring-0 text-2xl sm:text-3xl font-bold text-slate-800 w-full min-w-0"
                                    />
                                    {cashStr && (
                                        <button 
                                            onClick={() => setCashStr('')} 
                                            className="p-1.5 sm:p-2 ml-2 bg-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-300 rounded-full transition-colors shrink-0"
                                            tabIndex={-1}
                                        >
                                            <X className="h-4 w-4 sm:h-5 sm:w-5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* UPI Box */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                                <label className="block text-xs sm:text-sm font-bold text-slate-600 mb-3 uppercase tracking-wide">UPI Received</label>
                                <div className="flex items-center h-14 sm:h-16 bg-slate-50 border-2 border-slate-200 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-500/10 rounded-xl transition-all overflow-hidden px-4">
                                    <span className="text-xl sm:text-2xl text-slate-400 font-semibold mr-2">₹</span>
                                    <input 
                                        type="text" 
                                        inputMode="decimal"
                                        value={upiStr}
                                        onChange={handleUpiChange}
                                        placeholder="0"
                                        className="flex-1 h-full bg-transparent border-0 outline-none focus:ring-0 text-2xl sm:text-3xl font-bold text-slate-800 w-full min-w-0"
                                    />
                                    {upiStr && (
                                        <button 
                                            onClick={() => setUpiStr('')} 
                                            className="p-1.5 sm:p-2 ml-2 bg-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-300 rounded-full transition-colors shrink-0"
                                            tabIndex={-1}
                                        >
                                            <X className="h-4 w-4 sm:h-5 sm:w-5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                        </div>

                        {/* Balance Summary Box */}
                        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 mt-2">
                             <div className="flex justify-between items-center mb-4">
                                <span className="text-slate-500 font-bold text-sm sm:text-base tracking-wide">Total Received</span>
                                <span className="text-2xl sm:text-3xl font-bold text-slate-800">₹{received.toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-slate-100 w-full mb-4"></div>
                            <div className="flex justify-between items-center">
                                <span className={`font-black text-sm sm:text-base uppercase tracking-wider ${received >= total ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {balanceLabel}
                                </span>
                                <span className={`text-3xl sm:text-4xl font-black ${received >= total ? 'text-emerald-600' : 'text-red-500'}`}>
                                    ₹{amtToReturnOrPending.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        {/* Print Toggle */}
                        <div className="flex justify-end pt-2">
                            <label className="flex items-center gap-4 p-3 pr-4 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors shadow-sm">
                                <span className="text-sm font-bold text-slate-700 pl-2">Print Receipt</span>
                                <div className={`w-12 h-6 sm:h-7 rounded-full flex items-center transition-colors p-1 shadow-inner ${printerEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                    <div className={`bg-white w-4 sm:w-5 h-4 sm:h-5 rounded-full shadow-md transition-transform duration-200 ease-in-out ${printerEnabled ? 'translate-x-6 sm:translate-x-5' : 'translate-x-0'}`} />
                                </div>
                                <input 
                                    type="checkbox"
                                    checked={printerEnabled} 
                                    onChange={togglePrinter} 
                                    className="sr-only"
                                />
                            </label>
                        </div>

                    </div>
                </div>

                {/* BOTTOM STICKY ACTION BAR */}
                <div className="bg-white border-t border-slate-200 p-4 sm:p-6 shrink-0 z-20 sticky bottom-0 w-full">
                    <div className="max-w-2xl mx-auto">
                        <Button 
                            className={`w-full h-14 sm:h-16 text-lg sm:text-xl font-bold shadow-xl transition-all active:scale-[0.98] rounded-xl ${
                                isValid 
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/30' 
                                    : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none hover:bg-slate-300'
                            }`}
                            disabled={!isValid}
                            onClick={() => onComplete({ cash: cashAmt, upi: upiAmt })}
                        >
                            {isValid ? (
                                <>
                                    <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
                                    COMPLETE ORDER
                                </>
                            ) : (
                                <>INSUFFICIENT FUNDS</>
                            )}
                        </Button>
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    );
}

