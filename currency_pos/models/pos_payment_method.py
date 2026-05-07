from odoo import api, fields, models


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    currency_pos_payment_currency_id = fields.Many2one(
        "res.currency",
        string="Payment Currency",
        default=lambda self: self.env.company.currency_id,
    )

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)
        if "currency_pos_payment_currency_id" not in fields_list:
            fields_list.append("currency_pos_payment_currency_id")
        return fields_list
