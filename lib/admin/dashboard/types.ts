import type { FulfilmentType, OrderStatus, PaymentStatus } from "@prisma/client";

export type ComparisonDirection = "UP" | "DOWN" | "FLAT" | "NEW";

export type MoneyComparison = {
  direction: ComparisonDirection;
  percentage: string | null;
  absoluteDelta: string;
};

export type CountComparison = {
  direction: ComparisonDirection;
  percentage: string | null;
  absoluteDelta: number;
};

export type DashboardRecentOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  total: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  fulfilmentType: FulfilmentType;
  createdAt: string;
};

export type DashboardTopSku = {
  sku: string;
  title: string;
  unitsSold: number;
  merchandiseRevenue: string;
};

export type DashboardData = {
  reportingAt: string;
  revenue: { current: string; previousComparable: string; comparison: MoneyComparison };
  paidOrders: { current: number; previousComparable: number; comparison: CountComparison };
  averageOrderValue: {
    current: string | null;
    previousComparable: string | null;
    comparison: MoneyComparison | null;
  };
  fulfilment: {
    awaitingTotal: number;
    confirmed: number;
    processing: number;
    shipped: number;
    readyForPickup: number;
  };
  inventory: {
    outOfStock: number;
    lowStock: number;
    missingInventory: number;
    lowStockThreshold: number;
  };
  sales: { activeVariants: number };
  revenueTrend: Array<{ month: string; revenue: string; paidOrders: number }>;
  recentOrders: DashboardRecentOrder[];
  topSkus: DashboardTopSku[];
};
