/**
 * Dashboard financial metrics. Pure functions over already-fetched invoice
 * entries — no framework, no SDK, no I/O.
 *
 * Why compute here instead of in the database: invoice totals are *derived*
 * (items JSON + discount + tax) and Appwrite exposes no SUM/GROUP aggregation,
 * so the honest options are either a stored total column (schema migration,
 * backfill, drift risk on edits) or fetching a narrow projection and summing
 * it here. This module is the "summing here" half; the fetch half selects
 * only the columns it reads and leaves the rich-text bulk behind server-side.
 *
 * Every rule below mirrors the product's accounting semantics:
 * - Revenue is money *received* — only `paid` invoices count.
 * - Cancelled (`void`) invoices are excluded from revenue AND receivables:
 *   nothing is owed on them.
 * - Unpaid = status unset ("Belum dikirim") or `sent`.
 * - Overdue = unpaid AND past its due date. Invoices without a due date can
 *   never be overdue.
 */

import { calculateTotals } from '../invoice/calculator';
import type { Invoice, InvoiceStatus } from '../invoice/model';
import { addDaysIsoDate, diffDaysIsoDate, todayIsoDate } from '../shared/dates';
import type { Rupiah } from '../shared/money';

/** The invoice slice the dashboard's money math reads. */
export type InvoiceFinanceEntry = Pick<
  Invoice,
  | 'id'
  | 'invoiceNumber'
  | 'customerName'
  | 'customerPhone'
  | 'status'
  | 'date'
  | 'dueDate'
  | 'items'
  | 'discount'
  | 'tax'
  | 'createdAt'
  | 'paymentProof'
>;

/** Inclusive ISO-date window (`YYYY-MM-DD`). */
export type DateRange = { from: string; to: string };

/** Which preset (or custom window) the dashboard's period filter is on. */
export type PeriodChoice = 'week' | 'month' | 'custom';

/** How many calendar months the revenue chart covers, current month included. */
export const CHART_MONTHS = 6;

/** Grand total of one entry, via the same calculator the invoice itself uses. */
export function entryGrandTotal(entry: Pick<InvoiceFinanceEntry, 'items' | 'discount' | 'tax'>): Rupiah {
  return calculateTotals({
    items: entry.items,
    discount: entry.discount,
    tax: entry.tax,
  }).grandTotal;
}

/** Status bucket helpers — `null` is "Belum dikirim", `void` is cancelled. */
export function isUnpaid(status: InvoiceStatus | null): boolean {
  return status === null || status === 'sent';
}

export function isPaid(status: InvoiceStatus | null): boolean {
  return status === 'paid';
}

/** Inclusive ISO-date string comparison — lexicographic order == date order. */
export function inRange(isoDate: string, range: DateRange): boolean {
  return isoDate >= range.from && isoDate <= range.to;
}

/**
 * Monday of the current week through today.
 *
 * "This week" ends today, not Sunday: forecasting future days in a financial
 * summary would show money the business cannot have received yet.
 */
export function weekRange(now: string = todayIsoDate()): DateRange {
  const [year, month, day] = now.split('-').map(Number);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7; // Mon=0
  return { from: addDaysIsoDate(now, -weekday), to: now };
}

/** First day of the current month through today. Same rationale as `weekRange`. */
export function monthRange(now: string = todayIsoDate()): DateRange {
  return { from: `${now.slice(0, 7)}-01`, to: now };
}

/**
 * Normalises a custom pair into a valid range: blank/garbage falls back to
 * this month, and a reversed pair is swapped rather than rejected — the
 * filter must never wedge the dashboard into an error state.
 */
export function customRange(from: string, to: string, now: string = todayIsoDate()): DateRange {
  const fallback = monthRange(now);
  if (!isUsableDate(from) || !isUsableDate(to)) return fallback;
  return from <= to ? { from, to } : { from: to, to: from };
}

function isUsableDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Resolves the period picker into the window the summary cards read. */
export function periodRange(
  choice: PeriodChoice,
  custom: { from: string; to: string },
  now: string = todayIsoDate(),
): DateRange {
  if (choice === 'week') return weekRange(now);
  if (choice === 'month') return monthRange(now);
  return customRange(custom.from, custom.to, now);
}

/**
 * Start of the chart window: the first day of the month `CHART_MONTHS - 1`
 * months before the current one.
 */
export function chartStart(now: string = todayIsoDate()): string {
  const [year, month] = now.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 - (CHART_MONTHS - 1), 1));
  return date.toISOString().slice(0, 10);
}

/**
 * The window the dashboard must *fetch* to answer both the period cards and
 * the fixed-length chart: whichever start is earlier, and whichever end is
 * later. A custom range ending in the past still needs today's data for the
 * chart's current-month bucket; a future-dated range keeps its own end.
 */
export function financeFetchRange(range: DateRange, now: string = todayIsoDate()): DateRange {
  const chartFrom = chartStart(now);
  return {
    from: range.from < chartFrom ? range.from : chartFrom,
    to: range.to > now ? range.to : now,
  };
}

export type FinanceSummary = {
  /** Received revenue: grand totals of `paid` invoices in the period. */
  receivedRevenue: Rupiah;
  /** Outstanding receivables: grand totals of unpaid invoices in the period. */
  unpaidAmount: Rupiah;
  /** Unpaid in the period whose due date has passed. */
  overdueCount: number;
  overdueAmount: Rupiah;
  /** Every invoice dated in the period, any status — an activity count. */
  invoiceCount: number;
};

/**
 * The four headline money metrics for one period.
 *
 * Void invoices fall out of every bucket except `invoiceCount` (they were
 * still created — the count is activity, not money).
 */
export function summarizeFinance(
  entries: ReadonlyArray<InvoiceFinanceEntry>,
  range: DateRange,
  now: string = todayIsoDate(),
): FinanceSummary {
  let receivedRevenue = 0;
  let unpaidAmount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let invoiceCount = 0;

  for (const entry of entries) {
    if (!inRange(entry.date, range)) continue;
    invoiceCount += 1;

    if (isPaid(entry.status)) {
      receivedRevenue += entryGrandTotal(entry);
    } else if (isUnpaid(entry.status)) {
      const total = entryGrandTotal(entry);
      unpaidAmount += total;
      if (entry.dueDate !== undefined && entry.dueDate !== '' && entry.dueDate < now) {
        overdueCount += 1;
        overdueAmount += total;
      }
    }
  }

  return { receivedRevenue, unpaidAmount, overdueCount, overdueAmount, invoiceCount };
}

export type ChartPoint = {
  /** `YYYY-MM` bucket key. */
  month: string;
  /** Localised short label ("Jan", "Feb", …). */
  label: string;
  /** Received revenue in that month. */
  revenue: Rupiah;
};

const MONTH_LABELS = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });

/**
 * Received revenue per calendar month for the last `CHART_MONTHS` months.
 *
 * Bucketed by *invoice date*, not payment date: no payment timestamp exists
 * on the row (status flips record nothing), so invoice date is the only
 * honest anchor. The caption on the chart says so.
 */
export function revenueByMonth(
  entries: ReadonlyArray<InvoiceFinanceEntry>,
  now: string = todayIsoDate(),
): ChartPoint[] {
  const totals = new Map<string, number>();

  for (const entry of entries) {
    if (!isPaid(entry.status)) continue;
    const month = entry.date.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + entryGrandTotal(entry));
  }

  const points: ChartPoint[] = [];
  const [year, month] = now.split('-').map(Number);
  for (let offset = CHART_MONTHS - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    const key = date.toISOString().slice(0, 7);
    points.push({
      month: key,
      label: MONTH_LABELS.format(date),
      revenue: totals.get(key) ?? 0,
    });
  }
  return points;
}

export type AttentionItem = {
  entry: InvoiceFinanceEntry;
  total: Rupiah;
  /** Whole days past due, or null when the invoice is not overdue. */
  overdueDays: number | null;
};

/**
 * The unpaid invoices worth chasing, most urgent first.
 *
 * Sorts overdue (soonest due first) ahead of merely unpaid (latest invoice
 * first). Capped by the caller — this is a to-do list, not a report.
 */
export function attentionItems(
  entries: ReadonlyArray<InvoiceFinanceEntry>,
  now: string = todayIsoDate(),
  limit = 6,
): AttentionItem[] {
  const rows = entries
    .filter((entry) => isUnpaid(entry.status))
    .map((entry) => {
      const due = entry.dueDate;
      return {
        entry,
        total: entryGrandTotal(entry),
        // A blank or absent due date can never be overdue.
        overdueDays: due ? (due < now ? diffDaysIsoDate(due, now) : null) : null,
      };
    });

  rows.sort((a, b) => {
    if (a.overdueDays !== null && b.overdueDays === null) return -1;
    if (a.overdueDays === null && b.overdueDays !== null) return 1;
    if (a.overdueDays !== null && b.overdueDays !== null) {
      // Most urgent (closest due date) first — ascending days-overdue means
      // the *least* overdue leads; flip it so the worst surfaces on top.
      if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
      return (a.entry.dueDate ?? '').localeCompare(b.entry.dueDate ?? '');
    }
    return b.entry.date.localeCompare(a.entry.date);
  });

  return rows.slice(0, limit);
}

export type ActivityEvent = {
  kind: 'invoice-created' | 'payment-proof' | 'customer-created';
  /** ISO timestamp the event happened at. */
  at: string;
  invoiceNumber?: string;
  customerName?: string;
};

/** A customer-row creation stamp, as read from the directory projection. */
export type CustomerCreation = { name: string; createdAt: string };

/**
 * Recent activity, newest first, capped.
 *
 * Only events with a real timestamp ride along: invoice creation and payment
 * proof uploads (both stamped by the server) and customer creation. Payment
 * and cancellation *status flips* record no timestamp on the invoice row, so
 * they are deliberately absent — inventing them from `$updatedAt` would
 * misattribute every subsequent edit. (Fixing that needs a `paidAt` column;
 * see the dashboard notes.)
 */
export function recentActivity(
  invoices: ReadonlyArray<Pick<InvoiceFinanceEntry, 'invoiceNumber' | 'customerName' | 'createdAt' | 'paymentProof'>>,
  customers: ReadonlyArray<CustomerCreation>,
  limit = 8,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const invoice of invoices) {
    events.push({
      kind: 'invoice-created',
      at: invoice.createdAt,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
    });
    if (invoice.paymentProof) {
      events.push({
        kind: 'payment-proof',
        at: invoice.paymentProof.uploadedAt,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
      });
    }
  }

  for (const customer of customers) {
    events.push({ kind: 'customer-created', at: customer.createdAt, customerName: customer.name });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  return events.slice(0, limit);
}
