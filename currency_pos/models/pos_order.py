from odoo import models


class PosOrder(models.Model):
    _inherit = "pos.order"

    def _process_order(self, order, existing_order):
        order_id = super()._process_order(order, existing_order)
        self.browse(order_id).payment_ids._oca_fill_multicurrency_values()
        return order_id
