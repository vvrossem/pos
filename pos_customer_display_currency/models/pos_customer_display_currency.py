# -*- coding: utf-8 -*-
# Copyright 2019 Coop IT Easy SCRLfs
# 	    Vincent Van Rossem <vvrossem@gmail.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # TODO(Vincent) add field customer_display_currency_code or use/fetch Odoo's default currency
    customer_display_currency_char = fields.Char(
        size=1,
        required=True,
        string="User-defined Currency Character", default="$",
        help="The ASCII character to use for drawing the default currency symbol on the device.")

    @api.constrains('customer_display_currency_char')
    def _check_currency_char(self):
        """
         char_code can only be defined between character hex codes \x20 and \xFF
         (or decimal codes 32 and 255)

        """
        self.ensure_one()
        if not 32 <= ord(self.customer_display_currency_char) <= 255:
            raise ValidationError("User-defined Currency Character must be defined between "
                                  "character codes 20h (32) and FFh (255)")
