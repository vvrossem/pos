# Copyright 2019 Coop IT Easy SCRLfs
# 	    Robin Keunen <robin@coopiteasy.be>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

from odoo import models, fields, api
from odoo.exceptions import ValidationError


class Container(models.Model):
    _name = 'pos.container'
    _description = 'Container for bulk items'

    name = fields.Char(
        string='Name',
    )
    ean13 = fields.Char(
        'EAN13 Barcode',
        size=13,
    )
    weight = fields.Float(
        string='Weight (g)',
    )

    @api.multi
    @api.constrains('ean13')
    def _check_ean13(self):
        for container in self:
            if not container.ean13.startswith('49'):
                raise ValidationError(
                    'Container barcode must start with 49 prefix.'
                )
            if len(container.ean13) != 13:
                raise ValidationError(
                    'Container barcode must be 13 digit long.'
                )
