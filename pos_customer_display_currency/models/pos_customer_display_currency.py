# -*- coding: utf-8 -*-
# Copyright 2019 Coop IT Easy SCRLfs
# 	    Vincent Van Rossem <vvrossem@gmail.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class PosConfig(models.Model):
    _inherit = 'pos.config'

    customer_display_currency_char_code = fields.Char(
        size=1,
        string="Currency Character Code", default="~",
        help="The character code to use to draw a specific symbol on the device")


    #TODO(Vincent) implement function
    # @api.constrains(
    #     'customer_display_currency_char_code')
    # def _check_currency_char_code(self):
    #     """
    #      char_code can only be defined between ascii hex code \x20 and \xFF
    #     """
    #     self.ensure_one()
    #     if self.customer_display_currency_char_code:
