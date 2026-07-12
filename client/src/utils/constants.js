/** Single source of truth for enum display metadata across the UI. */

export const ASSET_STATUS = {
  AVAILABLE: { label: 'Available', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  ALLOCATED: { label: 'Allocated', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  RESERVED: { label: 'Reserved', badge: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500' },
  UNDER_MAINTENANCE: { label: 'Under Maintenance', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  LOST: { label: 'Lost', badge: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
  RETIRED: { label: 'Retired', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
  DISPOSED: { label: 'Disposed', badge: 'bg-slate-100 text-slate-500 ring-slate-400/20', dot: 'bg-slate-300' },
};

export const BOOKING_STATUS = {
  UPCOMING: { label: 'Upcoming', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  ONGOING: { label: 'Ongoing', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  COMPLETED: { label: 'Completed', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-red-50 text-red-600 ring-red-500/20', dot: 'bg-red-400' },
};

export const TRANSFER_STATUS = {
  REQUESTED: { label: 'Requested', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  APPROVED: { label: 'Approved', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  REJECTED: { label: 'Rejected', badge: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
  COMPLETED: { label: 'Completed', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
};

export const MAINTENANCE_STATUS = {
  PENDING: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  APPROVED: { label: 'Approved', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  REJECTED: { label: 'Rejected', badge: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
  ASSIGNED: { label: 'Technician Assigned', badge: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500' },
  IN_PROGRESS: { label: 'In Progress', badge: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20', dot: 'bg-cyan-500' },
  RESOLVED: { label: 'Resolved', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
};

export const PRIORITY = {
  LOW: { label: 'Low', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  MEDIUM: { label: 'Medium', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  HIGH: { label: 'High', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  CRITICAL: { label: 'Critical', badge: 'bg-red-50 text-red-700 ring-red-600/20' },
};

export const VERIFICATION = {
  PENDING: { label: 'Pending', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
  VERIFIED: { label: 'Verified', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  MISSING: { label: 'Missing', badge: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
  DAMAGED: { label: 'Damaged', badge: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
};

export const AUDIT_STATUS = {
  PLANNED: { label: 'Planned', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
  IN_PROGRESS: { label: 'In Progress', badge: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  CLOSED: { label: 'Closed', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
};

export const ROLES = {
  ADMIN: { label: 'Admin', badge: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20' },
  ASSET_MANAGER: { label: 'Asset Manager', badge: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20' },
  DEPARTMENT_HEAD: { label: 'Department Head', badge: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
  EMPLOYEE: { label: 'Employee', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
};

export const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'];

export const MANAGER_ROLES = ['ADMIN', 'ASSET_MANAGER'];
export const LEADERSHIP_ROLES = ['ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD'];

/**
 * Validated chart palette (dataviz reference instance).
 * Categorical slots are assigned in fixed order, never cycled.
 */
export const CHART = {
  categorical: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'],
  sequential: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
  grid: '#e1e0d9',
  axis: '#898781',
};
