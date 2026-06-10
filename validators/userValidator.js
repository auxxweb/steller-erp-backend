export const validateUserListQuery = (query) => {
  const errors = [];
  if (
    query.accountStatus &&
    !['active', 'deactivated'].includes(query.accountStatus)
  ) {
    errors.push('accountStatus must be active or deactivated');
  }
  return errors;
};
