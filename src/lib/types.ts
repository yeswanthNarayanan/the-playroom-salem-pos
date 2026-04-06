export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  is_available: boolean; // matches Supabase column
}

export interface OrderItem {
  id: string; // matches MenuItem.id
  name: string;
  price: number;
  quantity: number;
  sentQuantity?: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  timestamp: string; // ISO string matching created_at
  order_type?: string;
  payment_method?: string;
}

export interface HeldOrder {
  id: string;
  items: OrderItem[];
  orderType: 'takeaway' | 'delivery';
  paymentMethod: 'cash' | 'split' | 'upi';
  heldAt: string; // ISO timestamp
}

// Kitchen ticket as stored in Supabase
export interface KitchenTicket {
  id: string;            // tableKey or order UUID
  items: OrderItem[];
  status: 'pending' | 'prepared';
  prepared_items: Record<string, number>;
  updated_at: string;    // ISO timestamp
}

// Offline sync queue mutation types
export type SyncMutation =
  | { type: 'CREATE_ORDER'; payload: { order: Order } }
  | { type: 'ADD_MENU_ITEM'; payload: { item: Omit<MenuItem, 'id'> & { id: string } } }
  | { type: 'UPDATE_MENU_ITEM'; payload: { id: string; updates: Partial<MenuItem> } }
  | { type: 'TOGGLE_AVAILABILITY'; payload: { id: string; is_available: boolean } }
  | { type: 'ADD_TICKET_ITEM'; payload: { ticketId: string; item: OrderItem } }
  | { type: 'REMOVE_TICKET_ITEM'; payload: { ticketId: string; itemId: string } }
  | { type: 'UPDATE_TICKET_ITEM_QTY'; payload: { ticketId: string; itemId: string; quantity: number } }
  | { type: 'UPDATE_TICKET_STATUS'; payload: { ticketId: string; status: string; prepared_items: Record<string, number> } }
  | { type: 'UPSERT_KITCHEN_TICKET'; payload: { ticket: KitchenTicket } }
  | { type: 'DELETE_KITCHEN_TICKET'; payload: { id: string } };
