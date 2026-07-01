import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  event: string;
  message: string;
  at: string;
}

interface NotificationsState {
  items: NotificationItem[];
  unread: number;
  push: (n: Omit<NotificationItem, 'id' | 'at'>) => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  unread: 0,
  push: (n) =>
    set((s) => ({
      unread: s.unread + 1,
      items: [{ ...n, id: crypto.randomUUID(), at: new Date().toISOString() }, ...s.items].slice(0, 50),
    })),
  clear: () => set({ unread: 0 }),
}));
