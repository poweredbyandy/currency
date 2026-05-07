from odoo import api, fields, models


class PosPayment(models.Model):
    _inherit = "pos.payment"

    currency_pos_payment_currency_id = fields.Many2one(
        "res.currency",
        string="Payment Currency",
    )
    currency_pos_payment_amount_currency = fields.Monetary(
        string="Amount in Payment Currency",
        currency_field="currency_pos_payment_currency_id",
    )
    currency_pos_payment_rate = fields.Float(
        string="Applied Exchange Rate",
        digits=(16, 6),
        help="Rate used from POS order currency to payment currency.",
    )

    @api.model
    def _load_pos_data_fields(self, config_id):
        return [
            "name",
            "pos_order_id",
            "amount",
            "payment_method_id",
            "payment_date",
            "currency_id",
            "currency_rate",
            "partner_id",
            "session_id",
            "user_id",
            "company_id",
            "card_type",
            "card_brand",
            "card_no",
            "cardholder_name",
            "payment_ref_no",
            "payment_method_authcode",
            "payment_method_issuer_bank",
            "payment_method_payment_mode",
            "transaction_id",
            "payment_status",
            "ticket",
            "is_change",
            "account_move_id",
            "uuid",
            "currency_pos_payment_currency_id",
            "currency_pos_payment_amount_currency",
            "currency_pos_payment_rate",
        ]

    @api.model_create_multi
    def create(self, vals_list):
        payments = super().create(vals_list)
        payments._currency_pos_fill_multicurrency_defaults()
        return payments

    def write(self, vals):
        res = super().write(vals)
        self._currency_pos_fill_multicurrency_defaults()
        return res

    def _currency_pos_fill_multicurrency_defaults(self):
        for payment in self:
            payment_currency = (
                payment.currency_pos_payment_currency_id
                or payment.payment_method_id.currency_pos_payment_currency_id
                or payment.currency_id
            )
            values = {}

            if not payment.currency_pos_payment_currency_id:
                values["currency_pos_payment_currency_id"] = payment_currency.id

            if (
                payment.currency_pos_payment_amount_currency in (False, None)
                and payment.amount is not None
            ):
                if payment_currency == payment.currency_id:
                    values["currency_pos_payment_amount_currency"] = payment.amount
                else:
                    values["currency_pos_payment_amount_currency"] = payment.currency_id._convert(
                        payment.amount,
                        payment_currency,
                        payment.company_id,
                        payment.payment_date.date() if payment.payment_date else fields.Date.today(),
                    )

            if payment.currency_pos_payment_rate in (False, None, 0.0):
                if payment_currency == payment.currency_id:
                    values["currency_pos_payment_rate"] = 1.0
                else:
                    values["currency_pos_payment_rate"] = self.env[
                        "res.currency"
                    ]._get_conversion_rate(
                        payment.currency_id,
                        payment_currency,
                        payment.company_id,
                        payment.payment_date.date() if payment.payment_date else fields.Date.today(),
                    )

            if values:
                super(PosPayment, payment).write(values)
