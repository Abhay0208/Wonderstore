import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Order } from '../types';
import { storageAdapter, STORAGE_KEYS } from '../services/storageAdapter';
import { useTickets } from './TicketContext';
import { walletService } from '../services/walletService';

interface OrderContextType {
  orders: Order[];
  refreshOrders: () => Promise<void>;
  addOrder: (order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'> & { orderNumber?: string }) => Order;
  updateOrderStatus: (id: string, status: Order['status']) => void;
  deleteOrder: (id: string) => void;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export const OrderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userToken, staffSession } = useTickets();
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = storageAdapter.read<Order[]>(STORAGE_KEYS.ORDERS, []);
    return Array.isArray(saved) ? saved : [];
  });

  const ordersRef = useRef<Order[]>(orders);

  const persistOrders = (nextOrders: Order[]) => {
    ordersRef.current = nextOrders;
    storageAdapter.write(STORAGE_KEYS.ORDERS, nextOrders);
  };

  const mergeBackendOrders = useCallback((remoteOrders: Order[]) => {
    setOrders((prev) => {
      const remoteMap = new Map(remoteOrders.map((o) => [o.id, o]));
      // Keep local-only guest orders not yet in remoteMap
      const localOnly = prev.filter((o) => !remoteMap.has(o.id) && o.userId?.startsWith('guest_'));
      const merged = [...remoteOrders, ...localOnly].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      persistOrders(merged);
      return merged;
    });
  }, []);

  const refreshOrders = useCallback(async () => {
    const token = staffSession?.token || userToken;
    if (!token) return;
    try {
      const remote = await walletService.listOrders(token);
      mergeBackendOrders(remote);
    } catch {
      // keep existing cached orders on network/permission ignore
    }
  }, [staffSession?.token, userToken, mergeBackendOrders]);

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    const onSync = () => {
      void refreshOrders();
    };
    window.addEventListener('wondermc:orders-sync', onSync);
    return () => window.removeEventListener('wondermc:orders-sync', onSync);
  }, [refreshOrders]);

  const addOrder = (data: Omit<Order, 'id' | 'orderNumber' | 'createdAt'> & { orderNumber?: string }): Order => {
    const ordNum =
      data.orderNumber ||
      `WKP-${new Date().toISOString().replace(/-/g, '').slice(0, 8)}-${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`;
    const newOrder: Order = {
      ...data,
      id: `order-${Date.now()}-${Math.random().toString(36).substring(2, 4)}`,
      orderNumber: ordNum,
      createdAt: new Date().toISOString(),
    };
    const nextOrders = [newOrder, ...ordersRef.current];
    setOrders(nextOrders);
    persistOrders(nextOrders);
    return newOrder;
  };

  const updateOrderStatus = (id: string, status: Order['status']) => {
    const nextOrders = ordersRef.current.map((o) => (o.id === id ? { ...o, status } : o));
    setOrders(nextOrders);
    persistOrders(nextOrders);
    if (staffSession?.token) {
      void walletService.updateOrderStatus(staffSession.token, id, status).catch(() => undefined);
    }
  };

  const deleteOrder = (id: string) => {
    const nextOrders = ordersRef.current.filter((o) => o.id !== id);
    setOrders(nextOrders);
    persistOrders(nextOrders);
    if (staffSession?.token) {
      void walletService.deleteOrder(staffSession.token, id).catch(() => undefined);
    }
  };

  return (
    <OrderContext.Provider value={{ orders, refreshOrders, addOrder, updateOrderStatus, deleteOrder }}>
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (!context) throw new Error('useOrders must be used within an OrderProvider');
  return context;
};
