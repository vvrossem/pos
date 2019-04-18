# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ResUsers(models.Model):
    _inherit = 'res.users'

    wp_security_pin = fields.Char(string='Security PIN', size=32, help='A Security PIN used to protect sensible functionality in the weighing point')

    @api.constrains('wp_security_pin')
    def _check_pin(self):
        if self.wp_security_pin and not self.wp_security_pin.isdigit():
            raise UserError(_("Security PIN can only contain digits"))
