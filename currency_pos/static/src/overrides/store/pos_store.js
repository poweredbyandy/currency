import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";
import { EventBus } from "@odoo/owl";

patch(PosStore.prototype, {
    async setup(...args) {
        await super.setup(...args);
        this.currencyEventBus = new EventBus();
        this.exchange_currency_id = this._getDefaultPricelistCurrency();
    },

    _getCurrencyRecord(currencyLike) {
        if (!currencyLike) {
            return null;
        }
        if (typeof currencyLike === "object") {
            return currencyLike;
        }
        return this.models["res.currency"]?.find((currency) => currency.id === currencyLike) || null;
    },

    _getDefaultPricelistCurrency() {
        const pricelist = this.config?.pricelist_id;
        return this._getCurrencyRecord(pricelist?.currency_id) || this.company?.currency_id || null;
    },

    setExchangeCurrency(currency) {
        const oldCurrency = this.exchange_currency_id;
        this.exchange_currency_id = currency;
        if (oldCurrency !== currency) {
            this.currencyEventBus.trigger("change:exchange_currency_id", currency);
        }
    },

    getExchangeCurrency() {
        return (
            this.exchange_currency_id ||
            this._getDefaultPricelistCurrency() ||
            this.company?.currency_id
        );
    },

    getExchangeCurrencyForDisplay() {
        return this.exchange_currency_id || this._getDefaultPricelistCurrency();
    },

    getPaymentMethodDisplayText(pm, order) {
        const baseText = super.getPaymentMethodDisplayText(pm, order);
        const currency =
            pm.payment_currency_id ||
            this.company?.currency_id ||
            this.currency;
        if (!currency?.name) {
            return baseText;
        }
        return `${baseText} - ${currency.name}`;
    },
});
