'use client';

import { usePOSStore } from '@/store/pos-store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Minus, Trash2, Printer, ShoppingCart, Clock } from 'lucide-react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { OrderItem } from '@/lib/types';
import { isGameCategory } from '@/lib/constants';
import ReceiptModal from './ReceiptModal';
import KitchenReceiptModal from './KitchenReceiptModal';
import PaymentModal from './PaymentModal';
import HoldOrderModal from './HoldOrderModal';

export default function POSView() {
    const { menuItems, activeBill, activeOrderType, activePaymentMethod, printerEnabled, kitchenPrinterEnabled, addToBill, updateBillQuantity, clearBill, completeOrder, setOrderType, setPaymentMethod, activeTable, setActiveTable, tableBills, kitchenStatuses, markBillAsSentToKitchen, hotelName, hotelAddress, printerPaperSize, heldOrders, holdCurrentOrder } = usePOSStore();
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string>('All');
    const [isReceiptOpen, setIsReceiptOpen] = useState(false);
    const [isKitchenReceiptOpen, setIsKitchenReceiptOpen] = useState(false);
    const [isStandaloneKOT, setIsStandaloneKOT] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
    // Snapshot order so it doesn't clear during modal transition/closing
    const [capturedOrder, setCapturedOrder] = useState({ items: [] as OrderItem[], total: 0, orderType: '', paymentMethod: '', orderId: '', token: '' });

    const categories = ['All', ...Array.from(new Set(menuItems.map(item => item.category)))];
    const tables = Array.from({ length: 12 }, (_, i) => `T${i + 1}`);

    const filteredItems = menuItems.filter(item => {
        if (!item.is_available) return false;
        if (category !== 'All' && item.category !== category) return false;
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const total = activeBill.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const handleComplete = () => {
        if (activeBill.length === 0) return;

        if (activePaymentMethod === 'split' || activePaymentMethod === 'cash' || activePaymentMethod === 'upi') {
            // Because the user wanted "split should be functional like this amt enterable and calculatable... say weather its tallys...".
            // Since the new modal is a robust payment processor screen, let's just always show it, or at least for cash/split/upi.
            setIsPaymentModalOpen(true);
        } else {
            finishCompletionFlow();
        }
    };

    const finishCompletionFlow = () => {
        const finalOrderType = activeOrderType === 'dine_in' && activeTable
            ? `dine_in_${activeTable}`
            : activeOrderType;

        const newOrderId = uuidv4();
        const isTakeaway = activeOrderType === 'takeaway' || activeOrderType === 'delivery';
        const token = isTakeaway ? newOrderId.substring(0, 4).toUpperCase() : '';

        setCapturedOrder({
            items: [...activeBill],
            total,
            orderType: finalOrderType,
            paymentMethod: activePaymentMethod,
            orderId: newOrderId,
            token
        });

        // Check if there are any non-game items in the bill (for KOT decision)
        const catLookup: Record<string, string> = {};
        menuItems.forEach(mi => { 
            catLookup[mi.id] = mi.category; 
            catLookup[mi.name.toLowerCase()] = mi.category;
        });
        const hasNonGameItems = activeBill.some(item => {
            const cat = catLookup[item.id] || catLookup[item.name.toLowerCase()] || '';
            return !isGameCategory(cat);
        });

        // For Dine-In, KOT is sent separately, so we only auto-print KOT on checkout for Takeaway/Delivery
        // Skip KOT entirely if the order contains only game items
        if (kitchenPrinterEnabled && activeOrderType !== 'dine_in' && hasNonGameItems) {
            setIsStandaloneKOT(false);
            setIsKitchenReceiptOpen(true);
        } else if (printerEnabled) {
            setIsReceiptOpen(true);
        } else {
            // Skip receipt — just complete the order directly
            completeOrder(newOrderId);
        }
    };

    const handlePrintKOT = () => {
        if (activeBill.length === 0) return;

        const finalOrderType = activeOrderType === 'dine_in' && activeTable
            ? `dine_in_${activeTable}`
            : activeOrderType;

        setCapturedOrder({
            items: [...activeBill],
            total,
            orderType: finalOrderType,
            paymentMethod: activePaymentMethod,
            orderId: uuidv4(),
            token: ''
        });

        setIsStandaloneKOT(true);
        setIsKitchenReceiptOpen(true);
    };

    const handleReceiptClose = () => {
        setIsReceiptOpen(false);
    };

    const handleReceiptComplete = () => {
        completeOrder(capturedOrder.orderId);
        setIsReceiptOpen(false);
    };

    const handleKitchenReceiptComplete = () => {
        markBillAsSentToKitchen();
        setIsKitchenReceiptOpen(false);

        if (isStandaloneKOT) {
            setIsStandaloneKOT(false);
            return; // flow ends here
        }

        if (printerEnabled) {
            setIsReceiptOpen(true);
        } else {
            completeOrder(capturedOrder.orderId);
        }
    };

    return (
        <>
            {/*
            MOBILE (<768px): Single scrollable column — all items first, then order summary below
            TABLET PORTRAIT (md 768-1023px): Split top/bottom halves
            TABLET LANDSCAPE + DESKTOP (lg 1024px+): Split left/right
        */}
            <div className="w-full h-full min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row gap-2 md:gap-3">
                {/* =================== MENU GRID =================== */}
                <div className="shrink-0 md:h-full md:flex-1 flex flex-col bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 md:min-h-0 md:overflow-hidden">
                    {/* Search + Categories — sticky on mobile */}
                    <div className="px-3 pt-2.5 pb-2 sm:p-3 border-b border-slate-100 flex flex-col gap-2 shrink-0 sticky top-0 bg-white z-[2] md:static">
                        <div className="relative">
                            <Search className="absolute left-3 top-[8px] sm:top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search menu items..."
                                className="pl-9 h-8 sm:h-9 bg-slate-50 border-slate-200 focus-visible:ring-emerald-500 text-xs sm:text-sm rounded-lg"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                            {categories.map(cat => (
                                <Button
                                    key={cat}
                                    size="sm"
                                    variant={category === cat ? "default" : "outline"}
                                    className={`rounded-full whitespace-nowrap text-[10px] sm:text-xs h-6 sm:h-7 px-2.5 sm:px-3 ${category === cat ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                    onClick={() => setCategory(cat)}
                                >
                                    {cat}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Menu cards */}
                    <div className="p-2 sm:p-3 bg-slate-50/50 md:flex-1 md:overflow-y-auto md:min-h-0">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2">
                            {filteredItems.map(item => (
                                <Card
                                    key={item.id}
                                    className={`transition-all duration-150 active:scale-[0.97] bg-white border-slate-200 rounded-lg ${activeOrderType === 'dine_in' && !activeTable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-emerald-500 hover:shadow-md'}`}
                                    onClick={() => {
                                        if (activeOrderType === 'dine_in' && !activeTable) {
                                            // Optional: toast or alert (using alert to keep simple unless toast exists)
                                            return;
                                        }
                                        addToBill(item);
                                    }}
                                >
                                    <CardContent className="p-2.5 sm:p-3 flex flex-col justify-between">
                                        <div>
                                            <h3 className="font-semibold text-slate-800 text-xs sm:text-sm line-clamp-1 leading-snug">{item.name}</h3>
                                            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 font-medium">{item.category}</p>
                                        </div>
                                        <div className="mt-1.5 sm:mt-2 font-bold text-emerald-600 text-sm sm:text-base">
                                            ₹{Number(item.price).toFixed(2)}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </div>

                {/* =================== ORDER SUMMARY =================== */}
                <div className="shrink-0 md:h-full w-full md:w-80 lg:w-80 xl:w-80 2xl:w-80 md:flex-none flex flex-col bg-white rounded-lg sm:rounded-xl shadow-sm border border-slate-200 md:overflow-hidden md:min-h-0">
                    {/* Order header */}
                    <div className="px-4 py-3 sm:px-3 sm:py-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white rounded-t-lg sm:rounded-t-xl flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold text-base sm:text-sm text-slate-800">
                                {activeOrderType === 'dine_in' && activeTable ? `Order - ${activeTable}` : 'Current Order'}
                            </h2>
                            {heldOrders.length > 0 && (
                                <button
                                    onClick={() => setIsHoldModalOpen(true)}
                                    className="flex items-center gap-1 h-5 px-2 text-[10px] rounded-full bg-amber-100 text-amber-700 font-bold border border-amber-200 hover:bg-amber-200 transition-colors"
                                >
                                    <Clock className="w-3 h-3" />
                                    {heldOrders.length}
                                </button>
                            )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={clearBill} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 sm:h-6 px-2.5 text-xs sm:text-[10px] rounded-md">
                            <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3 mr-1" /> Clear
                        </Button>
                    </div>

                    {/* Scrollable middle area */}
                    <div className="md:flex-1 md:min-h-0 md:overflow-y-auto flex flex-col">
                        {/* Order items */}
                        <div className="px-4 py-3 sm:px-3 sm:py-2 flex-1">
                            {activeOrderType === 'dine_in' && !activeTable ? (
                                <div className="flex flex-col items-center justify-center text-slate-300 py-8 md:h-full md:py-0">
                                    <ShoppingCart className="w-10 h-10 sm:w-8 sm:h-8 opacity-30 mb-2" />
                                    <p className="text-sm sm:text-xs text-slate-500 font-medium">Select a Table</p>
                                    <p className="text-xs sm:text-[10px] text-slate-400 mt-1">to start taking an order</p>
                                </div>
                            ) : activeBill.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-slate-300 py-8 md:h-full md:py-0">
                                    <ShoppingCart className="w-10 h-10 sm:w-8 sm:h-8 opacity-30 mb-2" />
                                    <p className="text-sm sm:text-xs text-slate-400">No items added yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2 sm:space-y-1">
                                    {activeBill.map(item => (
                                        <div key={item.id} className="flex items-center gap-2 py-2 sm:py-1.5 border-b border-slate-100 last:border-0">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-slate-700 text-sm sm:text-xs leading-tight truncate">{item.name}</p>
                                                <p className="text-xs sm:text-[9px] text-slate-400">₹{Number(item.price).toFixed(2)} each</p>
                                            </div>
                                            <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 shrink-0">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-6 sm:w-6 rounded-l-lg hover:bg-slate-100" onClick={() => updateBillQuantity(item.id, item.quantity - 1)}>
                                                    <Minus className="w-3 h-3 sm:w-2.5 sm:h-2.5 text-slate-600" />
                                                </Button>
                                                <span className="text-sm sm:text-xs font-bold w-6 sm:w-5 text-center text-slate-800">{item.quantity}</span>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-6 sm:w-6 rounded-r-lg hover:bg-slate-100" onClick={() => updateBillQuantity(item.id, item.quantity + 1)}>
                                                    <Plus className="w-3 h-3 sm:w-2.5 sm:h-2.5 text-slate-600" />
                                                </Button>
                                            </div>
                                            <span className="font-semibold text-slate-800 text-sm sm:text-xs whitespace-nowrap w-16 text-right">₹{(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Order Type */}
                        <div className="px-4 py-3 sm:px-3 sm:py-2 border-t border-slate-100 bg-slate-50 shrink-0 space-y-3 sm:space-y-2 mt-auto">
                            <div>
                                <span className="text-[10px] sm:text-[9px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5 sm:mb-1">Order Type</span>
                                <div className="flex gap-2 sm:gap-1">
                                    {(['dine_in', 'takeaway', 'delivery'] as const).map(type => (
                                        <Button
                                            key={type}
                                            size="sm"
                                            variant={activeOrderType === type ? 'default' : 'outline'}
                                            onClick={() => setOrderType(type)}
                                            className={`flex-1 h-9 sm:h-7 capitalize text-xs sm:text-[10px] px-2 rounded-lg sm:rounded-md ${activeOrderType === type ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm' : 'text-slate-600 border-slate-200'}`}
                                        >
                                            {type === 'dine_in' ? 'Dine-In' : type === 'takeaway' ? 'Takeaway' : 'Delivery'}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            {/* Table Selection (Only for Dine-In) */}
                            {activeOrderType === 'dine_in' && (
                                <div>
                                    <span className="text-[10px] sm:text-[9px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5 sm:mb-1">Select Table</span>
                                    <div className="grid grid-cols-6 gap-1.5 sm:gap-1">
                                        {tables.map(t => {
                                            const hasItems = tableBills[t] && tableBills[t].length > 0;
                                            const isSelected = activeTable === t;
                                            return (
                                                <Button
                                                    key={t}
                                                    size="sm"
                                                    variant={isSelected ? 'default' : hasItems ? 'secondary' : 'outline'}
                                                    onClick={() => setActiveTable(t)}
                                                    className={`h-8 sm:h-7 px-0 text-[11px] sm:text-[10px] font-bold rounded-md ${isSelected ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                                                            : hasItems ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border-amber-200 border'
                                                                : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                                                        }`}
                                                >
                                                    {t}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Payment Method */}
                            <div>
                                <span className="text-[10px] sm:text-[9px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5 sm:mb-1">Payment Method</span>
                                <div className="flex gap-2 sm:gap-1">
                                    {(['cash', 'split', 'upi'] as const).map(method => (
                                        <Button
                                            key={method}
                                            size="sm"
                                            variant={activePaymentMethod === method ? 'default' : 'outline'}
                                            onClick={() => setPaymentMethod(method)}
                                            className={`flex-1 h-9 sm:h-7 uppercase text-xs sm:text-[10px] px-2 rounded-lg sm:rounded-md ${activePaymentMethod === method ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm' : 'text-slate-600 border-slate-200'}`}
                                        >
                                            {method}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Grand Total + Complete */}
                    <div className="px-4 py-3 sm:px-3 sm:py-2.5 border-t border-slate-200 bg-white rounded-b-lg sm:rounded-b-xl shrink-0">
                        <div className="flex items-center justify-between mb-3 sm:mb-2">
                            <span className="text-slate-600 text-sm sm:text-xs font-semibold">Grand Total</span>
                            <span className="text-2xl sm:text-xl font-extrabold text-emerald-600">₹{total.toFixed(2)}</span>
                        </div>
                        {kitchenPrinterEnabled && activeOrderType === 'dine_in' && (
                            <Button
                                className="w-full mb-2 h-11 sm:h-10 text-sm sm:text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm rounded-xl sm:rounded-lg"
                                disabled={activeBill.length === 0}
                                onClick={handlePrintKOT}
                            >
                                <Printer className="w-4 h-4 mr-2" /> Send KOT to Kitchen
                            </Button>
                        )}
                        {(activeOrderType === 'takeaway' || activeOrderType === 'delivery') && (
                            <Button
                                variant="outline"
                                className="w-full mb-2 h-11 sm:h-10 text-sm font-bold border-amber-400 text-amber-600 hover:bg-amber-50 rounded-xl sm:rounded-lg"
                                disabled={activeBill.length === 0}
                                onClick={holdCurrentOrder}
                            >
                                <Clock className="w-4 h-4 mr-2" /> Hold Order
                            </Button>
                        )}
                        <Button
                            className="w-full h-11 sm:h-10 text-sm sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 rounded-xl sm:rounded-lg active:scale-[0.98] transition-transform"
                            disabled={activeBill.length === 0}
                            onClick={handleComplete}
                        >
                            {printerEnabled ? (
                                <><Printer className="w-4 h-4 mr-2" /> Print &amp; Complete</>
                            ) : (
                                <>✓ Complete Order</>
                            )}
                        </Button>
                    </div>
                </div>

                <KitchenReceiptModal
                    isOpen={isKitchenReceiptOpen}
                    onClose={() => setIsKitchenReceiptOpen(false)}
                    onComplete={handleKitchenReceiptComplete}
                    items={capturedOrder.items}
                    orderType={capturedOrder.orderType}
                    token={capturedOrder.token}
                    preparedItems={kitchenStatuses[activeOrderType === 'dine_in' ? (activeTable || 'dine_in_unselected') : activeOrderType]?.preparedItems}
                    hotelName={hotelName}
                    hotelAddress={hotelAddress}
                    printerPaperSize={printerPaperSize}
                />

                <ReceiptModal
                    isOpen={isReceiptOpen}
                    onClose={handleReceiptClose}
                    onComplete={handleReceiptComplete}
                    items={capturedOrder.items}
                    total={capturedOrder.total}
                    orderType={capturedOrder.orderType}
                    paymentMethod={capturedOrder.paymentMethod}
                    token={capturedOrder.token}
                    hotelName={hotelName}
                    hotelAddress={hotelAddress}
                    printerPaperSize={printerPaperSize}
                />

                <PaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    onComplete={(splitData) => {
                        // splitData has { cash, upi } if you want to store it in the future,
                        // but for now it's just validated and passed to the next step.
                        setIsPaymentModalOpen(false);
                        finishCompletionFlow();
                    }}
                    total={total}
                    paymentMethod={activePaymentMethod}
                />

                <HoldOrderModal
                    isOpen={isHoldModalOpen}
                    onClose={() => setIsHoldModalOpen(false)}
                />
            </div>
        </>
    );
}
