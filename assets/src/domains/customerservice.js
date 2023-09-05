var _ = require('underscore');

var customerFactory = require("mozu-node-sdk/clients/commerce/customer/customerAccount");
var authTicketFactory = require("mozu-node-sdk/clients/commerce/customer/customerAuthTicket");

function CustomerService(context, callback) {
    this._context = context;
    this._callback = callback;
}

/**
 * Get a customer id by Id
 */
CustomerService.prototype.getCustomer = async function(custId) {
    console.log('Get Customer: ' + custId);
    try {
        return await customerClient.getAccount({
            accountId: custId
        });
    } catch (err) {
        console.error(JSON.stringify(err));
        this._callback(err);
    }
};

/**
 * Get a list of customer accounts with the given email.
 */
CustomerService.prototype.getCustomersByEmail = async function(email) {
    console.log("getCustomerByEmail...email: ", email);
    var filterExp = "EmailAddress eq " + email;
    var customerClientWithoutUserClaims = customerFactory();
    customerClientWithoutUserClaims.context['user-claims'] = null;

    try {
        const customerList = await customerClientWithoutUserClaims.getAccounts({
            filter: filterExp
        });
        return customerList;
    } catch (err) {
        console.error(JSON.stringify(err));
        this._callback(err);
    }
};

/**
 * Check to see if the update to the customer account does not have
 * duplicate email in another account. If a previous customer account
 * exists with the same email address throw a conflict exception
 * Otherwise, pass the call through to the service
 */
CustomerService.prototype.updateCustomerCheck = async function(customerAccount) {
    console.log("Trace in updateCustomerCheck()");
    try {
        var customerList = await this.getCustomersByEmail(customerAccount.emailAddress);
        console.log("Got a customerList");

        if (customerList.items.length === 0) {
            console.log("No records found ...continue updating.");
            return this._callback();
        }

        var registeredAccount = _.findWhere(customerList.items, {isAnonymous: false });
        var anonymousAccount = _.findWhere(customerList.items, {isAnonymous: true });

        console.log("Found existing customer with same email during update.");

        if ((registeredAccount && registeredAccount.id != customerAccount.id) || (anonymousAccount && anonymousAccount.id != customerAccount.id)) {
            var msg = "Unable to update account. Another customer account exists with the same email.";
            console.error(msg);
            return this._callback(new Error(msg));
        }

        console.log("The update is to the same record. Pass it through to get updated.");
        this._callback();
    } catch (err) {
        this._callback(err);
    }
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
CustomerService.prototype.addLoginOrGetCustomer = async function(customerAuth) {
    var customer = customerAuth.account;
    console.log("Trace...in addLoginOrGetCustomer");

    try {
        var customerList = await this.getCustomersByEmail(customer.emailAddress);
        console.log("Got a customerList: ");

        if (customerList.items.length === 0) {
            console.log("No customers exist with the same email...pass through to the api.");
            return this._callback();
        }

        var registeredAccount = _.findWhere(customerList.items, {isAnonymous: false });

        if (registeredAccount) {
            var msg = "Error: An account with the given email already exists. Please try with a different email or log-in.";
            console.error(msg);
            return this._callback(new Error(msg));
        }

        var anonymousAccount = _.findWhere(customerList.items, {isAnonymous: true });

        console.log("Found an existing anonymous customer. Upgrading to shopper account");
        var newAcctInfo = {
            emailAddress: customer.emailAddress,
            username: customer.emailAddress,
            password: customerAuth.password,
            isImport: false
        };


        // Need userclaims here since the service will store pre-existing userid in the returned access-token
        // CommerceRuntime then uses that in authentication when updating to the authenticated customer account
        // on the Order
        var customerClientWithoutUserClaims = customerFactory();
        delete customerClientWithoutUserClaims.context['user-claims'];

        var authTicketClient = authTicketFactory();        

        try {
            var newAcct = await customerClientWithoutUserClaims.addLoginToExistingCustomer({
                accountId: anonymousAccount.id
            }, {
                body: newAcctInfo
            });

            console.log("Updated anonymous account to shoppers account");

            var authRequest = {
                username: customer.emailAddress,
                password: customerAuth.password,
            }
            var authTicket = await authTicketClient.createUserAuthTicket({               
            },{
                body:authRequest
            });            
         
            this._context.exec.setAuthorized(true);          
            this._context.response.body = authTicket;
            this._context.response.end();
        } catch (err) {
            console.error(JSON.stringify(err));
            this._callback(JSON.stringify(err));
        }
    } catch (err) {
        this._callback(err);
    }
};

/**
 * This method checks to see if a customer exists with the given email. If it does, do the following:
 * 1. If a previous customer account exists with the same email address, throw a conflict exception.
 * 2. If the previous customer account is an anonymous user, switch the customer account to the old anonymous user.
 * 3. Otherwise, pass the call through to the service.
 */
CustomerService.prototype.addAnonymousOrGetCustomer = async function(customer) {
    console.log("Trace...in addAnonymousOrGetCustomer: ", customer);

    try {
        var customerList = await this.getCustomersByEmail(customer.emailAddress);

        if (customerList.items.length === 0) {
            console.log("No customers exist with the same email...continue adding record.");
            return this._callback();
        }

        var existingCustomer = _.findWhere(customerList.items, {isAnonymous: true });
        var enableAnonymousAndRegistered = this._context.configuration.enableAnonymousAndRegistered;
        console.log(enableAnonymousAndRegistered);

        if (!existingCustomer && enableAnonymousAndRegistered) {
            console.log("Add new anonymous customer");
            return this._callback();
        }

        console.log("Returning the existing anonymous shopper.");

        this._context.exec.setAuthorized(true);
        this._context.response.body = existingCustomer;
        this._context.response.end();
        this._callback();
    } catch (error) {
        console.error("An error occurred", error);
        this._callback();
    }
};

module.exports = CustomerService;
