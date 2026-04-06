'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePOSStore } from '@/store/pos-store';
import { Clock, Play, Trash2 } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function HoldOrderModal({ isOpen, onClose }: Props) {
    const { heldOrders, restoreHeldOrder, removeHeldOrder } = usePOSStore();

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-white p-0 gap-0 max-h-[80vh] flex flex-col rounded-2xl">
                <DialogHeader className="p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                    <DialogTitle className="text-lg font-bold flex items-center text-slate-800">
                        <Clock className="w-5 h-5 mr-2 text-amber-500" />
                        Held Orders ({heldOrders.length})
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {heldOrders.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-8">No held orders</p>
                    ) : (
                        heldOrders.map((order) => {
                            const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
                            const orderTotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                            const time = new Date(order.heldAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                            return (
                                <div key={order.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-800 text-sm">
                                                    {order.orderType === 'takeaway' ? '🛍️ Takeaway' : '🚚 Delivery'}
                                                </span>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                                                    {time}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {itemCount} items • ₹{orderTotal.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-slate-500 mb-3 line-clamp-1">
                                        {order.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => removeHeldOrder(order.id)}
                                            className="text-red-500 border-red-200 hover:bg-red-50 h-8 text-xs flex-1 rounded-lg"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Discard
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => { restoreHeldOrder(order.id); onClose(); }}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs flex-1 rounded-lg shadow-sm"
                                        >
                                            <Play className="w-3.5 h-3.5 mr-1" fill="currentColor" /> Resume
                                        </Button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
