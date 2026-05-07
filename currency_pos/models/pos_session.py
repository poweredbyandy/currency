from odoo import api, fields, models


class PosSession(models.Model):
    _inherit = "pos.session"

    @api.model
    def _load_pos_data_models(self, config_id):
        models = super()._load_pos_data_models(config_id)
        models.append("res.currency.rate")
        return models

    def _currency_pos_format_amount(self, amount, currency):
        decimals = currency.decimal_places if currency else 2
        return f"{(amount or 0.0):.{decimals}f}"

    def _currency_pos_amount_in_method_currency(self, payments, payment_method):
        currency = payment_method.currency_pos_payment_currency_id or self.currency_id
        total = 0.0
        for payment in payments:
            payment_currency = (
                payment.currency_pos_payment_currency_id
                or payment.payment_method_id.currency_pos_payment_currency_id
                or payment.currency_id
            )
            if (
                payment.currency_pos_payment_amount_currency is not None
                and payment_currency == currency
            ):
                total += payment.currency_pos_payment_amount_currency
                continue
            if payment.currency_id == currency:
                total += payment.amount
                continue
            total += payment.currency_id._convert(
                payment.amount,
                currency,
                payment.company_id,
                payment.payment_date.date() if payment.payment_date else fields.Date.today(),
            )
        return total, currency

    def get_closing_control_data(self):
        data = super().get_closing_control_data()
        orders = self._get_closed_orders()
        payments = orders.payment_ids.filtered(lambda p: p.payment_method_id.type != "pay_later")

        cash_payment_methods = self.payment_method_ids.filtered(lambda pm: pm.type == "cash")
        default_cash_method = cash_payment_methods[0] if cash_payment_methods else False
        if default_cash_method and data.get("default_cash_details"):
            cash_payments = payments.filtered(
                lambda p: p.payment_method_id.id == default_cash_method.id
            )
            amount_currency, currency = self._currency_pos_amount_in_method_currency(
                cash_payments, default_cash_method
            )
            data["default_cash_details"].update(
                {
                    "amount_currency": amount_currency,
                    "amount_currency_display": self._currency_pos_format_amount(
                        amount_currency, currency
                    ),
                    "amount_currency_name": currency.name,
                    "amount_currency_symbol": currency.symbol,
                }
            )

        non_cash_map = {item["id"]: item for item in data.get("non_cash_payment_methods", [])}
        methods = self.payment_method_ids.filtered(lambda pm: pm.id in non_cash_map)
        for method in methods:
            method_payments = payments.filtered(lambda p: p.payment_method_id.id == method.id)
            amount_currency, currency = self._currency_pos_amount_in_method_currency(
                method_payments, method
            )
            non_cash_map[method.id].update(
                {
                    "amount_currency": amount_currency,
                    "amount_currency_display": self._currency_pos_format_amount(
                        amount_currency, currency
                    ),
                    "amount_currency_name": currency.name,
                    "amount_currency_symbol": currency.symbol,
                }
            )

        return data
