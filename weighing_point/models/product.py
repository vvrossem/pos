# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    available_in_wp = fields.Boolean(
        string='Available in WP',
        help='Check if you want this product to appear in the Weighing Point.',
        default=False)

    to_weight = fields.Boolean(
        string='To Weigh With Scale',
        help="Check if the product should be weighted using the hardware scale integration.")

    wp_categ_id = fields.Many2one(
        'wp.category',
        string='Weighing Point Category',
        help="Category used in the Weighing Point.")

    @api.multi
    def unlink(self):
        return super(ProductTemplate, self).unlink()

    @api.onchange('sale_ok')
    def _onchange_sale_ok(self):
        if not self.sale_ok:
            self.available_in_wp = False


class ProductProduct(models.Model):
    _inherit = 'product.product'

    @api.multi
    def unlink(self):
        return super(ProductProduct, self).unlink()


class UomCateg(models.Model):
    _inherit = 'uom.category'

    is_wp_groupable = fields.Boolean(
        string='Group Products in WP',
        help="Check if you want to group products of this category in Weighing Point orders")

class Uom(models.Model):
    _inherit = 'uom.uom'

    is_wp_groupable = fields.Boolean(
        related='category_id.is_wp_groupable',
        readonly=False)
