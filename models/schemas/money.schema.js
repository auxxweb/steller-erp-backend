/** Reusable money field options (amounts in INR) */
export const moneyField = {
  type: Number,
  min: [0, 'Amount cannot be negative'],
  default: 0,
};

export const requiredMoneyField = {
  type: Number,
  required: true,
  min: [0, 'Amount cannot be negative'],
};
