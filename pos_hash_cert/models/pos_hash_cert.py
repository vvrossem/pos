import logging
import os

from odoo import api, fields, models
from odoo.tools.config import config

from checksumdir import dirhash

_logger = logging.getLogger(__name__)

CERT_DIR = config.get('certified_modules_directory', 'pos_certified_modules')
USER_DIR = os.path.expanduser("~")


class ModuleHash(models.Model):
    _inherit = 'ir.module.module'

    hash = fields.Char(compute='_compute_hash',
                       help='Module hash')

    @api.multi
    def _compute_hash(self):

        start_dir = os.path.dirname(os.path.realpath(__file__))
        last_root = start_dir
        current_root = start_dir
        found_cert_dir = None

        while found_cert_dir is None and current_root != USER_DIR:
            pruned = False
            for root, dirs, files in os.walk(current_root):
                if not pruned:
                    try:
                        # Remove the part of the tree we already searched
                        del dirs[dirs.index(os.path.basename(last_root))]
                        pruned = True
                    except ValueError:
                        pass
                if CERT_DIR in dirs:
                    # found the directory, stop
                    found_cert_dir = os.path.join(root, CERT_DIR)
                    break
                # Otherwise, pop up a level, search again
            last_root = current_root
            current_root = os.path.dirname(last_root)

        if found_cert_dir:
            certified_modules = [
                name
                for name in os.listdir(found_cert_dir)
                if os.path.isdir(os.path.join(found_cert_dir, name))
            ]

            for record in self:
                if record.name in certified_modules:
                    record.hash = dirhash(found_cert_dir, 'sha256', excluded_extensions=['pyc'])
        else:
            # TODO
            pass
