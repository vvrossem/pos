# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

from odoo import models, fields, api


class Container(models.Model):
    _name = 'container.container'
    _description = 'Container for bulk items'

    name = fields.Char(
        string='Name',
    )
    barcode = fields.Char(
        'Barcode',
        size=13,
    )
    weight = fields.Float(
        string='Weight (kg)',
    )
