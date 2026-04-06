'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SyncStatus } from '@/components/pos/SyncStatus';
import POSView from '@/components/pos/POSView';
import AdminView from '@/components/pos/AdminView';
import DashboardView from '@/components/pos/DashboardView';
import SalesSummaryView from '@/components/pos/SalesSummaryView';
import KitchenView from '@/components/pos/KitchenView';
import { LayoutDashboard, Settings, ShoppingCart, BarChart3, ChefHat } from 'lucide-react';

export default function Home() {
    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
            {/* Main Content — scrollable on mobile, locked viewport on tablet/desktop */}
            <div className="flex-1 flex flex-col min-h-0 overflow-auto md:overflow-hidden">
                <Tabs defaultValue="pos" className="flex-1 flex flex-col min-h-0 overflow-auto md:overflow-hidden">
                    {/* Header + Tab Navigation — single white bar */}
                    <header className="bg-white border-b border-slate-200 px-3 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between shrink-0 shadow-sm z-10 sticky top-0">
                        <div className="flex items-center space-x-2 shrink-0">
                            <img src="/logo.png" alt="The playroom Salem" className="w-6 h-6 sm:w-8 sm:h-8 rounded object-cover" />
                            <h1 className="text-sm sm:text-lg font-bold text-slate-800 tracking-tight hidden sm:block">The playroom Salem</h1>
                        </div>
                        <TabsList className="grid grid-cols-5 bg-slate-100 max-w-[320px] sm:max-w-md h-8 sm:h-9">
                            <TabsTrigger value="pos" className="text-[10px] sm:text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm h-6 sm:h-7 px-1.5 sm:px-3">
                                <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-0.5 sm:mr-1.5" />
                                POS
                            </TabsTrigger>
                            <TabsTrigger value="kitchen" className="text-[10px] sm:text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm h-6 sm:h-7 px-1.5 sm:px-3">
                                <ChefHat className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-0.5 sm:mr-1.5" />
                                Chef
                            </TabsTrigger>
                            <TabsTrigger value="dashboard" className="text-[10px] sm:text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm h-6 sm:h-7 px-1.5 sm:px-3">
                                <LayoutDashboard className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-0.5 sm:mr-1.5" />
                                Dash
                            </TabsTrigger>
                            <TabsTrigger value="sales" className="text-[10px] sm:text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm h-6 sm:h-7 px-1.5 sm:px-3">
                                <BarChart3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-0.5 sm:mr-1.5" />
                                Sales
                            </TabsTrigger>
                            <TabsTrigger value="admin" className="text-[10px] sm:text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm h-6 sm:h-7 px-1.5 sm:px-3">
                                <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-0.5 sm:mr-1.5" />
                                Admin
                            </TabsTrigger>
                        </TabsList>
                        <div className="shrink-0">
                            <SyncStatus />
                        </div>
                    </header>

                    {/* Tab Content — fills the rest */}
                    <TabsContent value="pos" className="flex-1 mt-0 outline-none flex min-h-0 px-2 sm:px-4 pb-2 sm:pb-4">
                        <POSView />
                    </TabsContent>
                    <TabsContent value="kitchen" className="flex-1 mt-0 outline-none overflow-y-auto min-h-0 relative">
                        <KitchenView />
                    </TabsContent>
                    <TabsContent value="dashboard" className="flex-1 mt-0 outline-none overflow-y-auto px-2 sm:px-4 pb-4 min-h-0">
                        <DashboardView />
                    </TabsContent>
                    <TabsContent value="sales" className="flex-1 mt-0 outline-none overflow-y-auto px-2 sm:px-4 pb-4 min-h-0">
                        <SalesSummaryView />
                    </TabsContent>
                    <TabsContent value="admin" className="flex-1 mt-0 outline-none overflow-y-auto px-2 sm:px-4 pb-4 min-h-0">
                        <AdminView />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
