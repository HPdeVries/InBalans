import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import ReceiptEuro from '@lucide/svelte/icons/receipt-euro';
import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
import Percent from '@lucide/svelte/icons/percent';
import FileChartColumn from '@lucide/svelte/icons/file-chart-column';
import Layers from '@lucide/svelte/icons/layers';
import Package from '@lucide/svelte/icons/package';
import Settings from '@lucide/svelte/icons/settings';
import type { MessageKey } from '../i18n';

export interface NavItem {
  path: string;
  label: MessageKey;
  icon: Component;
}

export interface NavGroup {
  label: MessageKey;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'nav.group.bookings',
    items: [
      { path: '/', label: 'nav.dashboard', icon: LayoutDashboard },
      { path: '/sales', label: 'nav.sales', icon: ReceiptEuro },
      { path: '/purchases', label: 'nav.purchases', icon: ShoppingBag },
    ],
  },
  {
    label: 'nav.group.reports',
    items: [
      { path: '/vat', label: 'nav.vat', icon: Percent },
      { path: '/annual', label: 'nav.annual', icon: FileChartColumn },
    ],
  },
  {
    label: 'nav.group.manage',
    items: [
      { path: '/assets', label: 'nav.assets', icon: Layers },
      { path: '/stock', label: 'nav.stock', icon: Package },
      { path: '/settings', label: 'nav.settings', icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items);
