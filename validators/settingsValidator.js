export const validateBranchSettings = (body) => {
  const errors = [];
  const { settings } = body;

  if (settings?.taxRate != null) {
    const n = Number(settings.taxRate);
    if (Number.isNaN(n) || n < 0 || n > 100) errors.push('Tax rate must be between 0 and 100');
  }
  if (settings?.defaultRentalGraceHours != null) {
    const n = Number(settings.defaultRentalGraceHours);
    if (Number.isNaN(n) || n < 0) errors.push('Grace hours cannot be negative');
  }
  if (settings?.invoicePrefix != null && !String(settings.invoicePrefix).trim()) {
    errors.push('Invoice prefix cannot be empty');
  }
  if (settings?.rentalPrefix != null && !String(settings.rentalPrefix).trim()) {
    errors.push('Rental prefix cannot be empty');
  }
  if (settings?.invoice?.gstin != null && settings.invoice.gstin !== '') {
    const gstin = String(settings.invoice.gstin).trim();
    if (gstin.length !== 15) errors.push('GSTIN must be 15 characters');
  }

  return errors;
};
