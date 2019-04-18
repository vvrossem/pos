# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    available_in_wp = fields.Boolean(string='Available in wp', help='Check if you want this product to appear in the weighing point.', default=False)
    to_weight = fields.Boolean(string='To Weigh With Scale', help="Check if the product should be weighted using the hardware scale integration.")
    wp_categ_id = fields.Many2one(
        'wp.category', string='weighing point Category',
        help="Category used in the weighing point.")

    @api.multi
    def unlink(self):
        product_ctx = dict(self.env.context or {}, active_test=False)
        if self.with_context(product_ctx).search_count([('id', 'in', self.ids), ('available_in_wp', '=', True)]):
            if self.env['wp.session'].search_count([('state', '!=', 'closed')]):
                raise UserError(_('You cannot delete a product saleable in weighing point while a session is still opened.'))
        return super(ProductTemplate, self).unlink()

    @api.onchange('sale_ok')
    def _onchange_sale_ok(self):
        if not self.sale_ok:
            self.available_in_wp = False


class ProductProduct(models.Model):
    _inherit = 'product.product'

    @api.multi
    def unlink(self):
        product_ctx = dict(self.env.context or {}, active_test=False)
        if self.env['wp.session'].search_count([('state', '!=', 'closed')]):
            if self.with_context(product_ctx).search_count([('id', 'in', self.ids), ('product_tmpl_id.available_in_wp', '=', True)]):
                raise UserError(_('You cannot delete a product saleable in weighing point while a session is still opened.'))
        return super(ProductProduct, self).unlink()


class UomCateg(models.Model):
    _inherit = 'uom.category'

    is_wp_groupable = fields.Boolean(string='Group Products in wp',
        help="Check if you want to group products of this category in weighing point orders")


class Uom(models.Model):
    _inherit = 'uom.uom'

    is_wp_groupable = fields.Boolean(related='category_id.is_wp_groupable', readonly=False)
