import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { formatCurrency } from "@point_of_sale/app/models/utils/currency";
import { toRaw } from "@odoo/owl";

patch(PosOrder.prototype, {
    setup(vals) {
        super.setup(vals);
        // Initialize exchange_currency_id
        this.exchange_currency_id = vals.exchange_currency_id || null;
    },

    /**
     * Get the current exchange currency for display (used by UI)
     */
    get_exchange_currency_for_display() {
        return this.exchange_currency_id;
    },

    electronic_payment_in_progress() {
        const allowedMethodIds = (this.config_id?.payment_method_ids || []).map((pm) => pm.id);
        return this.payment_ids.some((paymentLine) => {
            if (!paymentLine?.payment_method_id) {
                return false;
            }
            if (allowedMethodIds.length && !allowedMethodIds.includes(paymentLine.payment_method_id.id)) {
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
});
