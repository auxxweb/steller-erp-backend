import * as rentalService from '../rentalService.js';
import { logRentalTimeline, listRentalTimeline } from './rentalTimelineService.js';
import { recordAudit } from '../auditService.js';
import { notifyRentalEvent } from './workflowNotificationService.js';
import { assertCustomerCanBook } from '../riskEngineService.js';
import { validateBookingPayment } from '../paymentService.js';
import * as invoiceService from '../invoiceService.js';
import { checkBookingAvailability } from '../inventoryAvailabilityService.js';
import { buildBookingLines } from '../rentalService.js';
import { RENTAL_STATUS } from '../../models/constants/enums.js';
import { assertRentalTransition } from '../../utils/rentalConstants.js';
import AppError from '../../utils/AppError.js';
import Customer from '../../models/Customer.js';
import Rental from '../../models/Rental.js';

const branchIdOf = (rental) => rental.branch?._id || rental.branch;

const withWorkflow = async ({
  rental,
  event,
  fromStatus,
  toStatus,
  summary,
  metadata,
  actor,
  auditEntity = 'Rental',
}) => {
  await logRentalTimeline({
    rentalId: rental._id,
    branchId: branchIdOf(rental),
    event,
    fromStatus,
    toStatus,
    summary,
    metadata,
    performedBy: actor?._id,
  });

  await notifyRentalEvent({
    rental,
    title: summary,
    body: `Booking ${rental.rentalNumber} — ${toStatus || rental.status}`,
  });
};

export const workflowCheckAvailability = async (payload, actor) => {
  const branchId = rentalService.resolveBranchId(actor, payload.branch);
  const startAt = new Date(payload.scheduledStartAt);
  const endAt = new Date(payload.scheduledEndAt);

  const lines = await buildBookingLines({
    branchId,
    comboId: payload.combo,
    items: payload.items || [],
    scheduledStartAt: startAt,
    scheduledEndAt: endAt,
    rateType: payload.rateType || 'daily',
  });

  return checkBookingAvailability({
    branchId,
    startAt,
    endAt,
    combo: payload.combo,
    lines,
    excludeRentalId: payload.excludeRentalId,
  });
};

export const workflowCreateRental = async (payload, actor, auditMeta = {}) => {
  await assertCustomerCanBook(payload.customer, {
    allowOverride: Boolean(payload.riskOverride),
  });

  const customer = await Customer.findById(payload.customer);
  const depositRequired = Number(payload.deposit ?? payload.depositRequired ?? 0);
  const advancePaid = Number(payload.advancePaid ?? payload.amountPaid ?? 0);
  const rentalCount = await Rental.countDocuments({ customer: payload.customer });

  await validateBookingPayment({
    customerId: payload.customer,
    depositRequired,
    advancePaid,
    isNewCustomer: rentalCount === 0,
  });

  const data = await rentalService.createRental(payload, actor);
  const rental = await Rental.findById(data.rental.id).populate('branch customer');

  await withWorkflow({
    rental,
    event: 'booking_created',
    fromStatus: null,
    toStatus: rental.status,
    summary: `Booking ${rental.rentalNumber} created`,
    actor,
  });

  await recordAudit({
    ...auditMeta,
    action: 'create',
    entity: 'Rental',
    entityId: rental._id,
    summary: `Created rental ${rental.rentalNumber}`,
  });

  return data;
};

export const workflowReserveRental = async (id, actor, opts = {}, auditMeta = {}) => {
  const data = await rentalService.reserveRental(id, actor, opts);
  const rental = await Rental.findById(id).populate('branch customer');

  await withWorkflow({
    rental,
    event: 'inventory_reserved',
    fromStatus: RENTAL_STATUS.DRAFT,
    toStatus: rental.status,
    summary: `Inventory reserved for ${rental.rentalNumber}`,
    actor,
  });

  return data;
};

export const workflowConfirmRental = async (id, actor) => {
  const rental = await Rental.findById(id);
  if (!rental) throw new AppError('Rental not found', 404);

  const from = rental.status;
  assertRentalTransition(from, RENTAL_STATUS.CONFIRMED);

  rental.status = RENTAL_STATUS.CONFIRMED;
  rental.updatedBy = actor._id;
  await rental.save();
  await rental.populate('branch customer');

  await withWorkflow({
    rental,
    event: 'booking_confirmed',
    fromStatus: from,
    toStatus: RENTAL_STATUS.CONFIRMED,
    summary: `Booking ${rental.rentalNumber} confirmed`,
    actor,
  });

  return rentalService.getRentalById(id, actor);
};

export const workflowPickupRental = async (id, actor, payload, auditMeta = {}) => {
  const data = await rentalService.pickupRental(id, actor, payload);
  const rental = await Rental.findById(id).populate('branch customer');

  await withWorkflow({
    rental,
    event: 'pickup_completed',
    fromStatus: RENTAL_STATUS.RESERVED,
    toStatus: rental.status,
    summary: `Pickup completed for ${rental.rentalNumber}`,
    metadata: { scannedUnits: payload.scannedUnitIds },
    actor,
  });

  await recordAudit({
    ...auditMeta,
    action: 'status_change',
    entity: 'Rental',
    entityId: rental._id,
    summary: `Pickup — ${rental.rentalNumber}`,
  });

  return data;
};

export const workflowReturnRental = async (id, actor, payload, auditMeta = {}) => {
  const before = await Rental.findById(id);
  const data = await rentalService.returnRental(id, actor, payload);
  const rental = await Rental.findById(id).populate('branch customer');

  let invoice = null;
  if (rental.status === RENTAL_STATUS.RETURNED) {
    try {
      invoice = await invoiceService.createOrGetDraftInvoiceFromRental(id, actor);
    } catch {
      if (rental.invoice) {
        invoice = await invoiceService.getInvoiceById(rental.invoice, actor);
      }
    }
  }

  await withWorkflow({
    rental,
    event: 'return_processed',
    fromStatus: before.status,
    toStatus: rental.status,
    summary: `Return processed for ${rental.rentalNumber}`,
    metadata: { partial: rental.status === RENTAL_STATUS.PARTIALLY_RETURNED },
    actor,
  });

  return {
    ...data,
    invoice: invoice?.toPublicJSON?.() || invoice,
  };
};

export const workflowCloseRental = async (id, actor, options = {}, auditMeta = {}) => {
  const rentalBefore = await Rental.findById(id);
  if (rentalBefore?.invoice) {
    const inv = await invoiceService.getInvoiceById(rentalBefore.invoice, actor);
    if (inv && !inv.isLocked) {
      throw new AppError(
        'Finalize the invoice (Close job) before closing this booking',
        400,
      );
    }
  }

  const data = await rentalService.closeRental(id, actor);

  const rental = await Rental.findById(id).populate('branch customer');
  await withWorkflow({
    rental,
    event: 'booking_closed',
    fromStatus: RENTAL_STATUS.RETURNED,
    toStatus: RENTAL_STATUS.CLOSED,
    summary: `Booking ${rental.rentalNumber} closed`,
    actor,
  });

  return data;
};

export const workflowCancelRental = async (id, actor, reason, auditMeta = {}) => {
  const before = await Rental.findById(id);
  const data = await rentalService.cancelRental(id, actor, reason);
  const rental = await Rental.findById(id).populate('branch customer');

  await withWorkflow({
    rental,
    event: 'booking_cancelled',
    fromStatus: before.status,
    toStatus: RENTAL_STATUS.CANCELLED,
    summary: `Cancelled ${rental.rentalNumber}`,
    actor,
  });

  return data;
};

export const getRentalWorkflowTimeline = listRentalTimeline;

// Re-export core rental operations for controllers
export {
  rentalService,
  workflowCheckAvailability as checkAvailability,
};
