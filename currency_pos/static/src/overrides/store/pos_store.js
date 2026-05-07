import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";
import { EventBus } from "@odoo/owl";

patch(PosStore.prototype, {
    async setup(...args) {
        await super.setup(...args);
        this.exchange_currency_id = null;
        this.currencyEventBus = new EventBus();
    },

    setExchangeCurrency(currency) {
        const oldCurrency = this.exchange_currency_id;
        this.exchange_currency_id = currency;
        if (oldCurrency !== currency) {
            this.currencyEventBus.trigger("change:exchange_currency_id", currency);
        }
    },

    getExchangeCurrency() {
        return this.exchange_currency_id || this.company?.currency_id;
    },

    getExchangeCurrencyForDisplay() {
        return this.exchange_currency_id;
    },

    getPaymentMethodDisplayText(pm, order) {
        const baseText = super.getPaymentMethodDisplayText(pm, order);
        const currency =
            pm.currency_pos_payment_currency_id ||
            this.company?.currency_id ||
            this.currency;
        if (!currency?.name) {
            return baseText;
        }
        return `${baseText} - ${currency.name}`;
    },
});
