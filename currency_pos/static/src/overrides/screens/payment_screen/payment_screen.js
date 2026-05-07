import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";
import { onMounted, onWillUnmount } from "@odoo/owl";
import { convertCurrency } from "../../../utils/currency_utils";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        onMounted(() => {
            this.currencyEventListener = () => this.render();
            this.pos.currencyEventBus?.addEventListener("change:exchange_currency_id", this.currencyEventListener);
        });
        onWillUnmount(() => {
            if (this.currencyEventListener) {
                this.pos.currencyEventBus?.removeEventListener("change:exchange_currency_id", this.currencyEventListener);
            }
        });
    },

    getPaymentMethodRecord(methodOrId) {
        if (!methodOrId) {
            return null;
        }
        if (typeof methodOrId === "object") {
            return methodOrId;
        }
        return this.pos.models["pos.payment.method"].find((pm) => pm.id === methodOrId) || null;
    },

    getPaymentMethodId(methodOrId) {
        const method = this.getPaymentMethodRecord(methodOrId);
        return method?.id || null;
    },

    get exchangeCurrency() {
        return this.pos.getExchangeCurrencyForDisplay();
    },

    async clickExchangeCurrency() {
        const selectionList = this.getExchangeCurrencyList();
        const selectedCurrency = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Seleccionar moneda de cambio"),
            list: selectionList,
        });
        if (selectedCurrency) {
            this.pos.setExchangeCurrency(selectedCurrency);
        }
    },

    onMounted() {
        const order = this.pos.get_order();
        if (!order) {
            return;
        }
        this.normalizeInvalidPaymentLines(order);

        if (this.payment_methods_from_config.length === 1 && this.paymentLines.length === 0) {
            this.addNewPaymentLine(this.payment_methods_from_config[0]);
        }
    },

    normalizeInvalidPaymentLines(order = this.currentOrder) {
        if (!order) {
            return;
        }
        const allowedMethods = (this.pos.config.payment_method_ids || []).filter((pm) => pm?.id);
        const allowedMethodIds = new Set(allowedMethods.map((pm) => pm.id));
        const fallbackMethod = allowedMethods[0] || null;

        for (const payment of [...order.payment_ids]) {
            const currentMethodId = this.getPaymentMethodId(payment?.payment_method_id);
            if (currentMethodId && allowedMethodIds.has(currentMethodId)) {
                continue;
            }
            if (fallbackMethod) {
                payment.update?.({
                    payment_method_id: fallbackMethod,
                    amount: 0,
                    payment_status: "reversed",
                });
            }
        }
    },

    async addNewPaymentLine(paymentMethod) {
        const paymentMethodRecord = this.getPaymentMethodRecord(paymentMethod);
        const result = await super.addNewPaymentLine(...arguments);
        if (!result) {
            return result;
        }
        this.numberBuffer.reset();
        const methodCurrency =
            paymentMethodRecord?.currency_pos_payment_currency_id || this.pos.company.currency_id;
        const newLine = this.currentOrder?.payment_ids?.at(-1);
        if (!newLine) {
            return result;
        }
        if (newLine?.set_payment_currency && methodCurrency) {
            newLine.set_payment_currency(methodCurrency);
        }
        return result;
    },

    async validateOrder(isForceValidate) {
        this.normalizeInvalidPaymentLines(this.currentOrder);
        return super.validateOrder(...arguments);
    },

    get paymentLines() {
        return (this.currentOrder?.payment_ids || []).filter((line) => Boolean(line?.payment_method_id));
    },

    updateSelectedPaymentline(amount = false) {
        const selectedLine = this.selectedPaymentLine;
        const paymentMethod = this.getPaymentMethodRecord(selectedLine?.payment_method_id);
        if (!selectedLine || !paymentMethod) {
            return super.updateSelectedPaymentline(...arguments);
        }
        if (selectedLine.payment_method_id !== paymentMethod) {
            selectedLine.update({ payment_method_id: paymentMethod });
        }

        const paymentCurrency =
            selectedLine.getPaymentCurrency?.() ||
            paymentMethod.currency_pos_payment_currency_id ||
            this.pos.currency;
        const orderCurrency = this.currentOrder.currency_id || this.pos.currency;
        if (!paymentCurrency || !orderCurrency || paymentCurrency.id === orderCurrency.id) {
            return super.updateSelectedPaymentline(...arguments);
        }

        if (amount === false) {
            if (this.numberBuffer.get() === null) {
                amount = null;
            } else if (this.numberBuffer.get() === "") {
                amount = 0;
            } else {
                amount = this.numberBuffer.getFloat();
            }
        }

        const paymentTerminal = paymentMethod.payment_terminal;
        if (
            paymentTerminal &&
            !["pending", "retry"].includes(selectedLine.get_payment_status())
        ) {
            return;
        }

        if (amount === null) {
            this.deletePaymentLine(selectedLine.uuid);
            return;
        }

        const foreignAmount = Number(amount ?? 0) || 0;
        const baseAmount = convertCurrency(
            foreignAmount,
            paymentCurrency,
            orderCurrency,
            this.pos.models
        );
        const hasCashPaymentMethod = this.payment_methods_from_config.some(
            (method) => method.type === "cash"
        );
        if (
            !hasCashPaymentMethod &&
            baseAmount > this.currentOrder.get_due() + selectedLine.amount
        ) {
            selectedLine.set_amount_currency_foreign(0);
            const maxForeign = convertCurrency(
                this.currentOrder.get_due(),
                orderCurrency,
                paymentCurrency,
                this.pos.models
            );
            this.numberBuffer.set((maxForeign || 0).toString());
            this.showMaxValueError();
            return;
        }

        selectedLine.set_amount_currency_foreign(foreignAmount);
    },

    getExchangeCurrencyList() {
        const currencyList = [];
        const currentExchangeCurrency = this.exchangeCurrency;
        const companyCurrency = this.pos.company.currency_id;
        if (companyCurrency) {
            currencyList.push({
                id: companyCurrency.id,
                label: `${companyCurrency.name} (${companyCurrency.symbol})`,
                isSelected: (!currentExchangeCurrency) ||
                           (currentExchangeCurrency?.id === companyCurrency.id),
                item: companyCurrency,
            });
        }
        const currencyModel = this.pos.models["res.currency"];
        if (currencyModel) {
            currencyModel.forEach((currency) => {
                if (currency.id !== companyCurrency?.id) {
                    currencyList.push({
                        id: currency.id,
                        label: `${currency.name} (${currency.symbol})`,
                        isSelected: currentExchangeCurrency &&
                                   currentExchangeCurrency.id === currency.id,
                        item: currency,
                    });
                }
            });
        }
        return currencyList;
    },

    getConvertedTotalDue() {
        const exchangeCurrency = this.exchangeCurrency;
        if (!exchangeCurrency) {
            return null;
        }
        const totalDue = this.currentOrder.getTotalDue();
        const companyCurrency = this.pos.company.currency_id;
        if (!companyCurrency || exchangeCurrency.id === companyCurrency.id) {
            return null;
        }
        const convertedTotal = convertCurrency(
            totalDue,
            companyCurrency,
            exchangeCurrency,
            this.pos.models
        );
        const formattedTotal = convertedTotal.toFixed(2);
        const currencySymbol = exchangeCurrency.symbol || exchangeCurrency.name || "";
        return `${currencySymbol}${formattedTotal}`;
    },

    shouldShowTotalDueConversion() {
        const exchangeCurrency = this.exchangeCurrency;
        const companyCurrency = this.pos.company.currency_id;
        const totalDue = this.currentOrder.getTotalDue();
        return exchangeCurrency && companyCurrency &&
               exchangeCurrency.id !== companyCurrency.id &&
               totalDue > 0;
    },

    getPaymentLineForeignAmountDisplay(line) {
        const paymentCurrency = line?.getPaymentCurrency?.();
        const amountCurrency = line?.getPaymentAmountCurrency?.() ?? line?.get_amount?.() ?? 0;
        if (!paymentCurrency) {
            return "";
        }
        const symbolOrName = paymentCurrency.symbol || paymentCurrency.name || "";
        return `${amountCurrency} ${symbolOrName}`.trim();
    },

    getPaymentLineEquivalenceDisplay(line) {
        const paymentCurrency = line?.getPaymentCurrency?.();
        if (!paymentCurrency) {
            return "";
        }
        const rate = line?.getPaymentRate?.() ?? 1;
        const baseAmount = line?.get_amount?.() ?? 0;
        const baseDisplay = this.env.utils.formatCurrency(baseAmount);
        return `@ ${rate.toFixed(4)} = ${baseDisplay}`;
    },
});
