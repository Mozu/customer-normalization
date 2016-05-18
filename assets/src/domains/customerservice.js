var customerClient = require("mozu-node-sdk/clients/commerce/customer/customerAccount")();
var _ = require('underscore');

// remove userclaims to bypass auth limitations
customerClient.context['user-claims'] = null;
var customerClientWithUserClaims = require("mozu-node-sdk/clients/commerce/customer/customerAccount")();

function CustomerService(context, callback) {
    this._context = context;
    this._callback = callback;
}

/**
 * Get a customer id by Id
 */
CustomerService.prototype.getCustomer = function(custId) {
    console.log('Get Customer: ' + custId);
    return customerClient.getAccount({
        accountId: custId
    });
};

/**
 * Get a list of customer accounts with the given email.
 */
CustomerService.prototype.getCustomersByEmail = function(email) {
    console.log("getCustomerByEmail...email: ", email);
    var filterExp = "EmailAddress eq " + email;
    return customerClient.getAccounts({
        filter: filterExp
    }).then(function(customerList) {
        return customerList;
    }, function(err) {
        console.error(JSON.stringify(err));
        self._callback(err);
    });
};

/**
 * Check to see if the update to the customer account does not have
 * duplicate email in another account. If a previous customer account
 * exists with the same email address throw a conflict exception
 * Otherwise, pass the call through to the service
 */
CustomerService.prototype.updateCustomerCheck = function(customerAccount) {
    console.log("Trace in updateCustomerCheck()");
    var self = this;
    self.getCustomersByEmail(customerAccount.EmailAddress).then(function(customerList) {
        console.log("Got a customerList");
        if (customerList.items.length > 0) {
            var registeredAccount = _.findWhere(customerList.items, {isAnonymous: false });
            var anonymousAccount = _.findWhere(customerList.items, {isAnonymous: true });

            console.log("Found Existing Customer with same email during update.");
            if ( (registeredAccount && registeredAccount.id != customerAccount.id) && (anonymousAccount && anonymousAccount.id != customerAccount.id)) {
                // send error back in callback
                var msg = "Unable to update account.  Another customer account exists with the same email.";
                console.error(msg);
                self._callback(new Error(msg));
            } else {
                console.log("The update is to the same record.  Pass it through to get updated.");
                self._callback();
            }
        } else {
            console.log("No records found ...continue updating.");
            self._callback();
        }
    }, self._callback);

};

/**
 * We are trying to add a new customer with a login account.
 *
 * 1. Locate a previous customer account with the same email address
 *     a. The customer account is anonymous(IsAnonymous = true)
 *         i. Call AddLoginToExistingCustomer and return the result
 *     b. The customer account was previously authenticated(IsAnonymous = false)
 *         i. Throw a conflict exception
 * 2. If no previous customer account with the same email address pass the call through to the service
 */
CustomerService.prototype.addLoginOrGetCustomer = function(customerAuth) {
    var customer = customerAuth.Account;
    console.log("Trace...in addLoginOrGetCustomer");
    var self = this;
    self.getCustomersByEmail(customer.EmailAddress).then(function(customerList) {
        console.log("Got a customerList: ");
        if (customerList.items.length === 0) {
            console.log("No customers exist with the same email...pass through to the api.");
            return self._callback();
        }
        var registeredAccount = _.findWhere(customerList.items, {isAnonymous: false });

        if (registeredAccount) {
            var msg = "Error: An account with the given email already exists.  Please try with a different email or log-in.";
            console.error(msg);
            return self._callback(new Error(msg));
        }

         var anonymousAccount = _.findWhere(customerList.items, {isAnonymous: true });

        console.log("Found an existing anonymous customer. Upgrading to shopper account");
        var newAcctInfo = {
            emailAddress: customer.EmailAddress,
            username: customer.EmailAddress,
            password: customerAuth.Password,
            isImport: false
        };

        // Need userclaims here since the service will store pre-existing userid in the returned access-token
        // CommerceRuntime then uses that in authentication when updating to the authenticated customer account
        // on the Order
        customerClientWithUserClaims.addLoginToExistingCustomer({
            accountId: anonymousAccount.id
        }, {
            body: newAcctInfo
        }).then(function(newAcct) {
            console.log("Updated anonymous account to shoppers acount");

            self._context.exec.setAuthorized(true);
            self._context.response.body = newAcct;
            self._context.response.end();
        }, function(err) {
            self._callback(JSON.stringify(err));
        });
    }, self._callback);
};

/**
 * this method checks to see if a customer exists with the given email.  If it does, do the following:
 * 1.   If a previous customer account exists with the same email address throw a conflict exception
 * 2.   if previous customer account is an anonymous user, switch the customer account to the old anonymous user.
 * 3.   Otherwise, pass the call through to the service
 *
 */
CustomerService.prototype.addAnonymousOrGetCustomer = function(customer) {
    console.log("Trace...in addAnonymousOrGetCustomer: ", customer);
    var self = this;
    self.getCustomersByEmail(customer.EmailAddress).then(function(customerList) {
        if (customerList.items.length === 0) {
            console.log("No customers exist with the same email...continue adding record.");
            return self._callback();
        }

         var existingCustomer = _.findWhere(customerList.items, {isAnonymous: true });
         console.log(existingCustomer);
         if (!existingCustomer) { //existing anonymous customer not found...continue to add the customer
            console.log("Add new anonymous customer");
            return self._callback();
         }

        // TODO: should we update the existing user?  Other wise the name is(could be) changed in the order.
        console.log("Returning the existing anonymous shopper.");

        self._context.exec.setAuthorized(true);
        self._context.response.body = existingCustomer;
        self._context.response.end();
        self._callback();
    }, function(error) {
        console.error("An error occurred", error);
        self._callback();
    });
};

module.exports = CustomerService;
