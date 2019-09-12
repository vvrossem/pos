# Copyright 2019 Coop IT Easy SCRLfs
# @author Pierrick Brun <pierrick.brun@akretion.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl).

from odoo import api, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.multi
    def _prepare_done_order_line_for_pos(self, order_line):
        res = super(PosOrder, self)\
            ._prepare_done_order_line_for_pos(order_line)
        res['container_id'] = order_line.container_id.id
        res['container_weight'] = order_line.container_weight
        res['tare'] = order_line.tare
        return res
