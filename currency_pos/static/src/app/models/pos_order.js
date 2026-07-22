import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { formatCurrency } from "@point_of_sale/app/models/utils/currency";
import { toRaw } from "@odoo/owl";
import {
    convertCurrency,
    convertOrderRemainingToForeign,
} from "../utils/payment_currency_utils";

patch(PosOrder.prototype, {
    setup(vals) {
        super.setup(vals);
        this.exchange_currency_id = vals.exchange_currency_id || null;
    },

    get_exchange_currency_for_display() {
        return this.exchange_currency_id;
    },

    electronic_payment_in_progress() {
        const allowedMethodIds = (this.config_id?.payment_method_ids || []).map((pm) => pm.id);
        return this.payment_ids.some((paymentLine) => {
            if (!paymentLine?.payment_method_id) {
                return false;
            }
            if (
                allowedMethodIds.length &&
                !allowedMethodIds.includes(paymentLine.payment_method_id.id)
            ) {
                return false;
            }
            if (paymentLine.payment_status) {
                return !["done", "reversed"].includes(paymentLine.payment_status);
            }
            return false;
        });
    },

    is_paid_with_cash() {
        return !!this.payment_ids.find((paymentLine) => {
            const paymentMethod = paymentLine?.payment_method_id;
            if (!paymentMethod) {
                return false;
            }
            if (typeof paymentMethod === "object") {
                return Boolean(paymentMethod.is_cash_count);
            }
            const paymentMethodRecord = this.models["pos.payment.method"].find(
                (method) => method.id === paymentMethod
            );
            return Boolean(paymentMethodRecord?.is_cash_count);
        });
    },

    getCustomerDisplayData() {
        return {
            lines: this.getSortedOrderlines().map((line) => ({
                ...line.getDisplayData(),
                isSelected: line.isSelected(),
                imageSrc: `/web/image/product.product/${line.product_id.id}/image_128`,
            })),
            finalized: this.finalized,
            amount: formatCurrency(this.get_total_with_tax() || 0, this.currency),
            paymentLines: this.payment_ids
                .filter((paymentLine) => paymentLine)
                .map((paymentLine) => ({
                    name: paymentLine.payment_method_id?.name || "",
                    amount: formatCurrency(paymentLine.get_amount() || 0, this.currency),
                })),
            change: this.get_change() && formatCurrency(this.get_change(), this.currency),
            generalNote: this.general_note || "",
            qrPaymentData: toRaw(this.get_selected_paymentline()?.qrPaymentData),
        };
    },

    _hasForeignCurrencyPayments() {
        const config = this.config_id || this.config;
        if (!config?.allow_multi_currency_payment) {
            return false;
        }
        return this.payment_ids.some(
            (payment) => !payment.is_change && payment.isForeignCurrencyPayment?.()
        );
    },

    getForeignCurrencyRemaining(paymentCurrency) {
        return convertOrderRemainingToForeign(this, paymentCurrency, this.models);
    },

    get_due() {
        if (this._hasForeignCurrencyPayments()) {
            return this.taxTotals.order_sign * this.taxTotals.order_remaining;
        }
        return super.get_due(...arguments);
    },

    get_change() {
        if (this._hasForeignCurrencyPayments()) {
            const { order_sign, order_remaining: remaining } = this.taxTotals;
            return -order_sign * remaining;
        }
        return super.get_change(...arguments);
    },

    _getPaymentMethodRecord(paymentMethodLike) {
        if (!paymentMethodLike) {
            return null;
        }
        if (typeof paymentMethodLike === "object") {
            return paymentMethodLike;
        }
        return this.models["pos.payment.method"].find((method) => method.id === paymentMethodLike);
    },

    _getPaymentCurrencyRecord(paymentMethod) {
        if (!paymentMethod) {
            return null;
        }
        if (typeof paymentMethod.payment_currency_id === "object") {
            return paymentMethod.payment_currency_id;
        }
        return (
            this.models["res.currency"].find(
                (currency) => currency.id === paymentMethod.payment_currency_id
            ) || null
        );
    },

    _isForeignPaymentMethod(paymentMethod) {
        const config = this.config_id || this.config;
        if (!config?.allow_multi_currency_payment || !paymentMethod) {
            return false;
        }
        const paymentCurrency = this._getPaymentCurrencyRecord(paymentMethod);
        return Boolean(
            paymentCurrency && this.currency && paymentCurrency.id !== this.currency.id
        );
    },

    add_paymentline(payment_method) {
        const paymentMethod = this._getPaymentMethodRecord(payment_method);
        if (!this._isForeignPaymentMethod(paymentMethod)) {
            return super.add_paymentline(...arguments);
        }

        this.assert_editable();
        if (this.electronic_payment_in_progress()) {
            return false;
        }

        const paymentCurrency = this._getPaymentCurrencyRecord(paymentMethod);
        const orderDue = this.getDefaultAmountDueToPayIn(payment_method);
        const foreignAmount = convertCurrency(
            orderDue,
            this.currency,
            paymentCurrency,
            this.models
        );

        const newPaymentline = this.models["pos.payment"].create({
            pos_order_id: this,
            payment_method_id: payment_method,
        });
        this.select_paymentline(newPaymentline);
        newPaymentline.set_amount_currency_foreign(foreignAmount);

        if (
            paymentMethod.payment_terminal ||
            paymentMethod.payment_method_type === "qr_code"
        ) {
            newPaymentline.set_payment_status("pending");
        }
        return newPaymentline;
    },
});
