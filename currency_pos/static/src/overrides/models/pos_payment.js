import { PosPayment } from "@point_of_sale/app/models/pos_payment";
import { patch } from "@web/core/utils/patch";
import { roundDecimals } from "@web/core/utils/numbers";
import { convertCurrency, getExchangeRate } from "../../utils/currency_utils";

patch(PosPayment.prototype, {
    _getCurrencyRecord(currencyLike) {
        if (!currencyLike) {
            return null;
        }
        if (typeof currencyLike === "object") {
            return currencyLike;
        }
        return this.models["res.currency"].find((currency) => currency.id === currencyLike) || null;
    },

    _getPaymentMethodRecord(paymentMethodLike) {
        if (!paymentMethodLike) {
            return null;
        }
        if (typeof paymentMethodLike === "object") {
            return paymentMethodLike;
        }
        return this.models["pos.payment.method"].find((method) => method.id === paymentMethodLike) || null;
    },

    setup(vals) {
        super.setup(vals);
        const orderCurrency = this.pos_order_id?.currency;
        const paymentMethod = this._getPaymentMethodRecord(vals.payment_method_id || this.payment_method_id);
        const methodCurrency = this._getCurrencyRecord(
            paymentMethod?.currency_pos_payment_currency_id
        );
        const paymentCurrency = this._getCurrencyRecord(vals.currency_pos_payment_currency_id);
        const resolvedCurrency = paymentCurrency || methodCurrency || orderCurrency;
        const baseAmount = this.get_amount();
        this.currency_pos_payment_currency_id = resolvedCurrency || null;
        this.currency_pos_payment_amount_currency =
            vals.currency_pos_payment_amount_currency ?? baseAmount;
        this.currency_pos_payment_rate = vals.currency_pos_payment_rate || 1;
    },

    getPaymentCurrency() {
        const explicitCurrency = this._getCurrencyRecord(this.currency_pos_payment_currency_id);
        if (explicitCurrency) {
            return explicitCurrency;
        }
        const paymentMethod = this._getPaymentMethodRecord(this.payment_method_id);
        const methodCurrency = this._getCurrencyRecord(
            paymentMethod?.currency_pos_payment_currency_id
        );
        return (
            methodCurrency ||
            this.pos_order_id?.currency
        );
    },

    getPaymentAmountCurrency() {
        return this.currency_pos_payment_amount_currency ?? this.get_amount();
    },

    getPaymentRate() {
        return this.currency_pos_payment_rate || 1;
    },

    set_payment_currency(currency) {
        const orderCurrency = this.pos_order_id?.currency;
        const paymentCurrency = currency || orderCurrency;
        if (!orderCurrency || !paymentCurrency) {
            return;
        }
        const rate = getExchangeRate(orderCurrency, paymentCurrency, this.models);
        const amountCurrency =
            paymentCurrency.id === orderCurrency.id
                ? this.get_amount()
                : convertCurrency(this.get_amount(), orderCurrency, paymentCurrency, this.models);
        this.update({
            currency_pos_payment_currency_id: paymentCurrency,
            currency_pos_payment_amount_currency: roundDecimals(
                amountCurrency,
                paymentCurrency.decimal_places
            ),
            currency_pos_payment_rate: rate || 1,
        });
    },

    convertAmountToOrderCurrency(amountCurrency) {
        const orderCurrency = this.pos_order_id?.currency;
        const paymentCurrency = this.getPaymentCurrency();
        if (!orderCurrency || !paymentCurrency || amountCurrency === null) {
            return amountCurrency;
        }
        if (paymentCurrency.id === orderCurrency.id) {
            return amountCurrency;
        }
        return convertCurrency(amountCurrency, paymentCurrency, orderCurrency, this.models);
    },

    set_amount_currency_foreign(amountCurrency) {
        if (this.pos_order_id?.assert_editable) {
            this.pos_order_id.assert_editable();
        }
        const paymentCurrency = this.getPaymentCurrency();
        const orderCurrency = this.pos_order_id?.currency;
        if (!paymentCurrency || !orderCurrency) {
            this.set_amount(amountCurrency);
            return;
        }
        const baseAmount = this.convertAmountToOrderCurrency(parseFloat(amountCurrency) || 0);
        this.update({
            amount: roundDecimals(baseAmount || 0, orderCurrency.decimal_places),
            currency_pos_payment_amount_currency: roundDecimals(
                parseFloat(amountCurrency) || 0,
                paymentCurrency.decimal_places
            ),
            currency_pos_payment_rate:
                getExchangeRate(orderCurrency, paymentCurrency, this.models) || 1,
        });
    },

    set_amount(value) {
        if (!this.pos_order_id?.assert_editable || !this.pos_order_id?.currency) {
            this.update({
                amount: parseFloat(value) || 0,
            });
            return;
        }
        super.set_amount(...arguments);
        const paymentCurrency = this.getPaymentCurrency();
        const orderCurrency = this.pos_order_id?.currency;
        if (!paymentCurrency || !orderCurrency) {
            return;
        }
        const amountCurrency =
            paymentCurrency.id === orderCurrency.id
                ? this.get_amount()
                : convertCurrency(this.get_amount(), orderCurrency, paymentCurrency, this.models);
        this.update({
            currency_pos_payment_amount_currency: roundDecimals(
                amountCurrency,
                paymentCurrency.decimal_places
            ),
            currency_pos_payment_rate:
                getExchangeRate(orderCurrency, paymentCurrency, this.models) || 1,
        });
    },

    export_for_printing() {
        const data = super.export_for_printing(...arguments);
        const paymentCurrency = this.getPaymentCurrency();
        return {
            ...data,
            currency_pos_payment_currency_name: paymentCurrency?.name || "",
            currency_pos_payment_currency_symbol: paymentCurrency?.symbol || "",
            currency_pos_payment_amount_currency: this.getPaymentAmountCurrency(),
            currency_pos_payment_rate: this.getPaymentRate(),
        };
    },
});
