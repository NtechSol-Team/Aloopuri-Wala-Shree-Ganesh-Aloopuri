import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Factory,
  Boxes,
  Truck,
  ShoppingCart,
  ShoppingBag,
  ReceiptText,
  Wallet,
  TrendingUp,
  BarChart3,
  Users,
  Store,
  Landmark,
  Contact,
  Settings,
} from 'lucide-react';
import type { UserRole } from '@/types/api';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const ALL: UserRole[] = ['SUPER_ADMIN', 'GODOWN_MANAGER', 'FRANCHISE_OWNER', 'CASHIER'];

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'GODOWN_MANAGER', 'FRANCHISE_OWNER'] },
  { label: 'Production', href: '/production', icon: Factory, roles: ['SUPER_ADMIN', 'GODOWN_MANAGER'] },
  { label: 'Purchases', href: '/purchases', icon: ShoppingBag, roles: ['SUPER_ADMIN', 'GODOWN_MANAGER'] },
  { label: 'Inventory', href: '/inventory', icon: Boxes, roles: ['SUPER_ADMIN', 'GODOWN_MANAGER'] },
  { label: 'Transfers', href: '/transfers', icon: Truck, roles: ['SUPER_ADMIN', 'GODOWN_MANAGER'] },
  { label: 'Orders', href: '/orders', icon: ShoppingCart, roles: ['SUPER_ADMIN', 'FRANCHISE_OWNER'] },
  { label: 'Billing', href: '/billing', icon: ReceiptText, roles: ['SUPER_ADMIN', 'FRANCHISE_OWNER'] },
  { label: 'Payments', href: '/payments', icon: Wallet, roles: ['SUPER_ADMIN', 'FRANCHISE_OWNER', 'GODOWN_MANAGER'] },
  { label: 'Expenses', href: '/expenses', icon: TrendingUp, roles: ['SUPER_ADMIN', 'GODOWN_MANAGER'] },
  { label: 'Products', href: '/products', icon: Store, roles: ['SUPER_ADMIN'] },
  { label: 'Customers', href: '/customers', icon: Contact, roles: ['SUPER_ADMIN', 'FRANCHISE_OWNER'] },
  { label: 'Accounting', href: '/accounting', icon: Landmark, roles: ['SUPER_ADMIN'] },
  { label: 'Analytics', href: '/analytics', icon: BarChart3, roles: ['SUPER_ADMIN'] },
  { label: 'Users', href: '/users', icon: Users, roles: ['SUPER_ADMIN'] },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ALL },
];

export const POS_HREF = '/pos';

export function navForRole(role: UserRole): NavItem[] {
  return navItems.filter((i) => i.roles.includes(role));
}

export const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Owner',
  GODOWN_MANAGER: 'Godown Manager',
  FRANCHISE_OWNER: 'Franchise Owner',
  CASHIER: 'Cashier',
};
