/** Centralized enums for Mongoose schemas */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  BRANCH_ADMIN: 'branch_admin',
  EMPLOYEE: 'employee',
  DELIVERY_STAFF: 'delivery_staff',
};

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
};

export const BRANCH_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  CLOSED: 'closed',
};

export const CATEGORY_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

export const PRODUCT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DISCONTINUED: 'discontinued',
};

export const PRODUCT_TYPE = {
  RENTAL: 'rental',
  SALE: 'sale',
  BOTH: 'both',
};

/** Shared pool branch code (auto-created system branch) */
export const COMMON_INVENTORY_BRANCH_CODE = 'COMMON';

/** Sent from admin UI when "Shared catalog (all branches)" is selected. */
export const COMMON_INVENTORY_PAYLOAD_VALUE = '__common_inventory__';

export const INVENTORY_SCOPE = {
  BRANCH: 'branch',
  COMMON: 'common',
};

export const PRODUCT_UNIT_STATUS = {
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  RENTED: 'rented',
  MAINTENANCE: 'maintenance',
  IN_TRANSFER: 'in_transfer',
  RETIRED: 'retired',
  LOST: 'lost',
};

export const PRODUCT_CONDITION = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor',
  DAMAGED: 'damaged',
};

export const QR_SCAN_ACTION = {
  PICKUP: 'pickup',
  RETURN: 'return',
  TRANSFER: 'transfer',
  MAINTENANCE: 'maintenance',
};

export const PRODUCT_HISTORY_ACTION = {
  PRODUCT_CREATED: 'product_created',
  PRODUCT_UPDATED: 'product_updated',
  PRODUCT_STATUS_CHANGED: 'product_status_changed',
  PRODUCT_DELETED: 'product_deleted',
  UNIT_CREATED: 'unit_created',
  UNIT_UPDATED: 'unit_updated',
  UNIT_STATUS_CHANGED: 'unit_status_changed',
  UNIT_BRANCH_CHANGED: 'unit_branch_changed',
  UNIT_CONDITION_CHANGED: 'unit_condition_changed',
  UNIT_RETIRED: 'unit_retired',
  QR_PICKUP: 'qr_pickup',
  QR_RETURN: 'qr_return',
  QR_TRANSFER: 'qr_transfer',
  QR_MAINTENANCE: 'qr_maintenance',
  TRANSFER_DISPATCHED: 'transfer_dispatched',
  TRANSFER_DELIVERED: 'transfer_delivered',
};

export const COMBO_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

/** How combo rental price is derived from constituent products */
export const COMBO_PRICING_RULE = {
  SUM_WITH_DISCOUNT: 'sum_with_discount',
  FIXED_BUNDLE: 'fixed_bundle',
  SUM_PRODUCTS: 'sum_products',
};

export const CUSTOMER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
};

export const CUSTOMER_TYPE = {
  INDIVIDUAL: 'individual',
  BUSINESS: 'business',
};

export const RISK_LEVEL = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

export const ID_PROOF_TYPE = {
  AADHAAR: 'aadhaar',
  PAN: 'pan',
  PASSPORT: 'passport',
  DRIVING_LICENSE: 'driving_license',
  VOTER_ID: 'voter_id',
  OTHER: 'other',
};

export const RENTAL_TYPE = {
  PREBOOK: 'prebook',
  DIRECT: 'direct',
};

export const RENTAL_STATUS = {
  DRAFT: 'draft',
  RESERVED: 'reserved',
  CONFIRMED: 'confirmed',
  PICKED_UP: 'picked_up',
  ACTIVE: 'active',
  OVERDUE: 'overdue',
  PARTIALLY_RETURNED: 'partially_returned',
  RETURNED: 'returned',
  MAINTENANCE: 'maintenance',
  CANCELLED: 'cancelled',
  CLOSED: 'closed',
};

export const RENTAL_ITEM_STATUS = {
  PENDING: 'pending',
  RESERVED: 'reserved',
  ISSUED: 'issued',
  RETURNED: 'returned',
  DAMAGED: 'damaged',
  LOST: 'lost',
  CANCELLED: 'cancelled',
};

export const INVOICE_STATUS = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  VOID: 'void',
  CANCELLED: 'cancelled',
};

/** How the customer paid (or will pay) the invoice balance */
export const INVOICE_PAYMENT_TYPE = {
  CASH: 'cash',
  ONLINE: 'online',
  SPLIT: 'split',
};

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
};

export const PAYMENT_METHOD = {
  CASH: 'cash',
  UPI: 'upi',
  CARD: 'card',
  BANK_TRANSFER: 'bank_transfer',
  CHEQUE: 'cheque',
  OTHER: 'other',
};

export const MAINTENANCE_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const MAINTENANCE_TYPE = {
  PREVENTIVE: 'preventive',
  CORRECTIVE: 'corrective',
  INSPECTION: 'inspection',
  CLEANING: 'cleaning',
  REPAIR: 'repair',
};

export const TRANSFER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

export const TRANSFER_ITEM_STATUS = {
  PENDING: 'pending',
  DISPATCHED: 'dispatched',
  DELIVERED: 'delivered',
};

export const NOTIFICATION_TYPE = {
  RENTAL: 'rental',
  PAYMENT: 'payment',
  MAINTENANCE: 'maintenance',
  TRANSFER: 'transfer',
  SYSTEM: 'system',
  LEAVE: 'leave',
  ALERT: 'alert',
};

export const NOTIFICATION_CHANNEL = {
  IN_APP: 'in_app',
  PUSH: 'push',
  EMAIL: 'email',
  SMS: 'sms',
};

export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  HALF_DAY: 'half_day',
  ON_LEAVE: 'on_leave',
};

export const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

export const LEAVE_TYPE = {
  SICK: 'sick',
  CASUAL: 'casual',
  EARNED: 'earned',
  UNPAID: 'unpaid',
  OTHER: 'other',
};

export const AUDIT_ACTION = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  LOGOUT: 'logout',
  STATUS_CHANGE: 'status_change',
  PAYMENT: 'payment',
  EXPORT: 'export',
  UPLOAD: 'upload',
};
