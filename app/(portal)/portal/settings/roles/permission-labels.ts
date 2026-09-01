import type { Permission } from '@/lib/auth/permissions'

/**
 * The permission strings in staff language (prd.md §4 defines the strings;
 * the labels are UI copy for non-technical staff). Grouping is presentation
 * only — the vocabulary stays flat and atomic.
 */

export const PERMISSION_LABELS: Record<Permission, string> = {
  'booking.view': 'View bookings',
  'booking.create': 'Create bookings',
  'booking.amend': 'Amend bookings',
  'booking.cancel': 'Cancel bookings',
  'booking.override_hold': 'Override booking holds',
  'booking.discount': 'Discount bookings',
  'payment.verify': 'Verify payments',
  'payment.record_cash': 'Record cash payments',
  'inspection.record': 'Record inspections',
  'charge.create': 'Create charges',
  'charge.waive': 'Waive charges',
  'deposit.approve_release': 'Approve deposit release',
  'unit.manage': 'Manage units',
  'tenancy.manage': 'Manage tenancies',
  'config.manage': 'Edit settings, roles & the unit registry',
  'report.view': 'View reports',
  'document.view_identity': 'View identity documents',
}

export const PERMISSION_GROUPS: readonly { label: string; permissions: readonly Permission[] }[] = [
  {
    label: 'Bookings',
    permissions: [
      'booking.view',
      'booking.create',
      'booking.amend',
      'booking.cancel',
      'booking.discount',
      'booking.override_hold',
    ],
  },
  {
    label: 'Payments & charges',
    permissions: ['payment.verify', 'payment.record_cash', 'charge.create', 'charge.waive'],
  },
  {
    label: 'Deposits & inspections',
    permissions: ['deposit.approve_release', 'inspection.record'],
  },
  {
    label: 'Property',
    permissions: ['unit.manage', 'tenancy.manage'],
  },
  {
    label: 'Administration',
    permissions: ['config.manage', 'report.view', 'document.view_identity'],
  },
]
