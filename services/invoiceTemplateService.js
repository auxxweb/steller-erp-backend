const formatMoney = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Printable HTML invoice (browser print → PDF).
 */
export const renderInvoiceHtml = (invoice) => {
  const biz = invoice.businessSnapshot || {};
  const cust = invoice.customerSnapshot || {};
  const amounts = invoice.amounts || {};
  const payment = invoice.payment || {};
  const lines = invoice.lineItems || [];

  const paymentLabel =
    payment.type === 'split'
      ? `Cash ${formatMoney(payment.cashAmount)} + Online ${formatMoney(payment.onlineAmount)}`
      : payment.type === 'online'
        ? 'Online'
        : 'Cash';

  const lineRows = lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td style="text-align:center">${line.quantity}</td>
        <td style="text-align:right">${formatMoney(line.unitPrice)}</td>
        <td style="text-align:right">${formatMoney(line.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; color: #111; margin: 0; padding: 24px; font-size: 14px; }
    .header { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
    .logo { max-height: 64px; max-width: 180px; object-fit: contain; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .muted { color: #555; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; }
    th { text-align: left; font-size: 12px; text-transform: uppercase; color: #666; }
    .totals { margin-left: auto; width: 280px; }
    .totals td { border: none; padding: 4px 0; }
    .totals .total { font-weight: 700; font-size: 16px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #eee; font-size: 12px; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${biz.logoUrl ? `<img class="logo" src="${escapeHtml(biz.logoUrl)}" alt="Logo" />` : ''}
      <h1>${escapeHtml(biz.name || 'Stellar Rentals')}</h1>
      <p class="muted">${escapeHtml(biz.address || '')}</p>
      <p class="muted">${escapeHtml(biz.phone || '')}${biz.email ? ` · ${escapeHtml(biz.email)}` : ''}</p>
      ${biz.gstin ? `<p class="muted">GSTIN: ${escapeHtml(biz.gstin)}</p>` : ''}
    </div>
    <div style="text-align:right">
      <h1>INVOICE</h1>
      <p><strong>${escapeHtml(invoice.invoiceNumber)}</strong></p>
      <p class="muted">Date: ${formatDate(invoice.issueDate)}</p>
      <p class="muted">Due: ${formatDate(invoice.dueDate)}</p>
      <span class="badge">${escapeHtml(invoice.status)}</span>
      ${invoice.isCredit ? '<span class="badge">Credit</span>' : ''}
    </div>
  </div>

  <div style="display:flex;gap:48px;margin-bottom:24px">
    <div>
      <p class="muted" style="margin:0 0 4px">Bill to</p>
      <p style="margin:0;font-weight:600">${escapeHtml(cust.name || '')}</p>
      <p class="muted">${escapeHtml(cust.phone || '')}</p>
      <p class="muted">${escapeHtml(cust.email || '')}</p>
      <p class="muted">${escapeHtml(cust.address || '')}</p>
      ${cust.gstin ? `<p class="muted">GSTIN: ${escapeHtml(cust.gstin)}</p>` : ''}
    </div>
    ${
      invoice.rental?.rentalNumber
        ? `<div><p class="muted">Rental</p><p>${escapeHtml(invoice.rental.rentalNumber)}</p></div>`
        : ''
    }
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Rate</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">${formatMoney(amounts.subtotal)}</td></tr>
    <tr><td>Discount</td><td style="text-align:right">−${formatMoney(amounts.discount)}</td></tr>
    ${amounts.lateFee ? `<tr><td>Late fee</td><td style="text-align:right">${formatMoney(amounts.lateFee)}</td></tr>` : ''}
    ${amounts.damageFee ? `<tr><td>Damage fee</td><td style="text-align:right">${formatMoney(amounts.damageFee)}</td></tr>` : ''}
    ${
      amounts.gstEnabled !== false
        ? `<tr><td>GST (${amounts.gstRate || 0}%)</td><td style="text-align:right">${formatMoney(amounts.tax)}</td></tr>`
        : ''
    }
    <tr class="total"><td>Total</td><td style="text-align:right">${formatMoney(amounts.total)}</td></tr>
    <tr><td>Advance paid</td><td style="text-align:right">−${formatMoney(amounts.advanceAmount)}</td></tr>
    <tr><td>Other payments</td><td style="text-align:right">−${formatMoney(amounts.amountPaid)}</td></tr>
    <tr class="total"><td>Balance due</td><td style="text-align:right">${formatMoney(amounts.balanceDue)}</td></tr>
    <tr><td>Payment</td><td style="text-align:right">${paymentLabel}</td></tr>
  </table>

  ${invoice.notes ? `<p style="margin-top:24px"><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</p>` : ''}
  ${invoice.terms ? `<p class="muted">${escapeHtml(invoice.terms)}</p>` : ''}
</body>
</html>`;
};

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildWhatsAppShareText = (invoice) => {
  const amounts = invoice.amounts || {};
  const cust = invoice.customerSnapshot || {};
  return [
    `Invoice ${invoice.invoiceNumber}`,
    `Customer: ${cust.name || '—'}`,
    `Total: ${formatMoney(amounts.total)}`,
    `Advance: ${formatMoney(amounts.advanceAmount)}`,
    `Balance: ${formatMoney(amounts.balanceDue)}`,
    invoice.isCredit ? '(Credit sale)' : '',
  ]
    .filter(Boolean)
    .join('\n');
};
