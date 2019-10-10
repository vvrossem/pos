from odoo import api, fields, models
from odoo.modules.module import get_module_path

from checksumdir import dirhash


class ModuleHash(models.Model):
    _inherit = 'ir.module.module'

    hash = fields.Char(compute='_compute_hash',
                       help='Module hash')

    @api.multi
    def _compute_hash(self):
        print(self)
        whitelist = [
            'pos_container',
            'pos_customer_display',
            'pos_customer_display_currency',
            'pos_hash_cert',
            'pos_toledo_container',
            'pos_toledo_product',
        ]
        for record in self:
            if record.name in whitelist:
                print(record.name)
                module_path = get_module_path(record.name)
                record.hash = dirhash(module_path, 'sha256', excluded_extensions=['pyc'])
