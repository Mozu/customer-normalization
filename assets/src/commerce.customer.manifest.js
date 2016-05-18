module.exports = {
  
  'cnAddAccountBefore': {
      actionName: 'http.commerce.customer.accounts.addAccount.before',
      customFunction: require('./domains/commerce.customer/cnAddAccountBefore')
  },
  
  'cnAddAccountAndLoginBefore': {
      actionName: 'http.commerce.customer.accounts.addAccountAndLogin.before',
      customFunction: require('./domains/commerce.customer/cnAddAccountAndLoginBefore')
  },
  
  'cnUpdateAccountBefore': {
      actionName: 'http.commerce.customer.accounts.updateAccount.before',
      customFunction: require('./domains/commerce.customer/cnUpdateAccountBefore')
  }
};
