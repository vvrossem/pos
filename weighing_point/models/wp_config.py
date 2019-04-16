# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import datetime
from uuid import uuid4

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class WpConfig(models.Model):
    _name = 'wp.config'
    _description = 'Weighing Point Configuration'

    def _default_pricelist(self):
        return self.env['product.pricelist'].search([('currency_id', '=', self.env.user.company_id.currency_id.id)], limit=1)

    def _get_default_location(self):
        return self.env['stock.warehouse'].search([('company_id', '=', self.env.user.company_id.id)], limit=1).lot_stock_id

    def _get_group_wp_manager(self):
        return self.env.ref('weighing_point.group_wp_manager')

    def _get_group_wp_user(self):
        return self.env.ref('weighing_point.group_wp_user')

    name = fields.Char(
        string='Weighing Point Name',
        index=True,
        required=True,
        help="An internal identification of the weighing point.")

    stock_location_id = fields.Many2one(
        'stock.location',
        string='Stock Location',
        domain=[('usage', '=', 'internal')],
        required=True,
        default=_get_default_location)

    #TODO(Vincent) how to handle?
    currency_id = fields.Many2one(
        'res.currency',
        compute='_compute_currency',
        string="Currency")

    iface_electronic_scale = fields.Boolean(
        string='Electronic Scale',
        help="Enables Electronic Scale integration.")

    iface_vkeyboard = fields.Boolean(
        string='Virtual KeyBoard',
        help=u"Don’t turn this option on if you weighing point is on smartphones or tablets."
             u"Such devices already benefit from a native keyboard.")

    iface_print_via_proxy = fields.Boolean(
        string='Print via Proxy',
        help="Bypass browser printing and prints via the hardware proxy.")

    iface_scan_via_proxy = fields.Boolean(
        string='Scan via Proxy',
        help="Enable barcode scanning with a remotely connected barcode scanner.")

    iface_big_scrollbars = fields.Boolean(
        'Large Scrollbars',
        help='For imprecise industrial touchscreens.')

    iface_tax_included = fields.Selection(
        [('subtotal', 'Tax-Excluded Price'), ('total', 'Tax-Included Price')],
        string="Tax Display",
        default='subtotal', required=True)

    iface_start_categ_id = fields.Many2one(
        'wp.category',
        string='Initial Category',
        help='The weighing point will display this product category by default.'
             'If no category is specified, all available products will be shown.')

    iface_display_categ_images = fields.Boolean(
        string='Display Category Pictures',
        help="The product categories will be displayed with pictures.")

    restrict_price_control = fields.Boolean(
        string='Restrict Price Modifications to Managers',
        help="Only users with Manager access rights for WP app can modify the product prices on the weighing point.")

    receipt_header = fields.Text(
        string='Receipt Header',
        help="A short text that will be inserted as a header in the printed receipt.")

    receipt_footer = fields.Text(
        string='Receipt Footer',
        help="A short text that will be inserted as a footer in the printed receipt.")

    proxy_ip = fields.Char(
        string='IP Address',
        size=45,
        help='The hostname or ip address of the hardware proxy. Will be autodetected if left empty.')

    active = fields.Boolean(default=True)

    uuid = fields.Char(
        readonly=True,
        default=lambda self: str(uuid4()),
        help='A globally unique identifier for this wp configuration, '
             'used to prevent conflicts in client-generated data.')

    session_ids = fields.One2many(
        'wp.session',
        'config_id',
        string='Sessions')

    current_session_id = fields.Many2one(
        'wp.session',
        compute='_compute_current_session',
        string="Current Session")

    current_session_state = fields.Char(compute='_compute_current_session')

    last_session_closing_date = fields.Date(compute='_compute_last_session')

    wp_session_username = fields.Char(compute='_compute_current_session_user')

    wp_session_state = fields.Char(compute='_compute_current_session_user')

    wp_session_duration = fields.Char(compute='_compute_current_session_user')

    pricelist_id = fields.Many2one(
        'product.pricelist',
        string='Default Pricelist',
        required=True,
        default=_default_pricelist,
        help="The pricelist used if no customer is selected or if the customer has no Sale Pricelist configured.")

    available_pricelist_ids = fields.Many2many(
        'product.pricelist',
        string='Available Pricelists',
        default=_default_pricelist,
        help="Make several pricelists available in the Weighing Point. "
             "You can also apply a pricelist to specific customers from their contact form (in Sales tab). "
             "To be valid, this pricelist must be listed here as an available pricelist. "
             "Otherwise the default pricelist will apply.")

    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.user.company_id)

    barcode_nomenclature_id = fields.Many2one(
        'barcode.nomenclature',
        string='Barcode Nomenclature',
        help='Defines what kind of barcodes are available '
             'and how they are assigned to products, customers and cashiers.')

    group_wp_manager_id = fields.Many2one(
        'res.groups',
        string='Weighing Point Manager Group',
        default=_get_group_wp_manager,
        help='This field is there to pass the id of the wp manager group to the Weighing Point client.')

    group_wp_user_id = fields.Many2one(
        'res.groups',
        string='Weighing Point User Group',
        default=_get_group_wp_user,
        help='This field is there to pass the id of the wp user group to the Weighing Point client.')

    iface_tipproduct = fields.Boolean(string="Product tips") #TODO(Vincent) needed?

    tip_product_id = fields.Many2one(
        'product.product',
        string='Tip Product',
        help="This product is used as reference on customer receipts.")

    tax_regime = fields.Boolean("Tax Regime")

    tax_regime_selection = fields.Boolean("Tax Regime Selection value")

    barcode_scanner = fields.Boolean("Barcode Scanner")

    start_category = fields.Boolean("Set Start Category")

    is_iotbox = fields.Boolean("IoTBox")

    is_header_or_footer = fields.Boolean("Header & Footer")

    @api.depends()
    def _compute_currency(self):
        for wp_config in self:
            wp_config.currency_id = self.env.user.company_id.currency_id.id

    @api.depends('session_ids')
    def _compute_current_session(self):
        for wp_config in self:
            session = wp_config.session_ids.filtered(lambda r: r.user_id.id == self.env.uid and \
                not r.state == 'closed' and \
                not r.rescue)
            # sessions ordered by id desc
            wp_config.current_session_id = session and session[0].id or False
            wp_config.current_session_state = session and session[0].state or False

    @api.depends('session_ids')
    def _compute_last_session(self):
        WpSession = self.env['wp.session']
        for wp_config in self:
            session = WpSession.search_read(
                [('config_id', '=', wp_config.id), ('state', '=', 'closed')],
                ['cash_register_balance_end_real', 'stop_at'],
                order="stop_at desc", limit=1)
            if session:
                wp_config.last_session_closing_cash = session[0]['cash_register_balance_end_real']
                wp_config.last_session_closing_date = session[0]['stop_at'].date()
            else:
                wp_config.last_session_closing_cash = 0
                wp_config.last_session_closing_date = False

    @api.depends('session_ids')
    def _compute_current_session_user(self):
        for wp_config in self:
            session = wp_config.session_ids.filtered(lambda s: s.state in ['opening_control', 'opened', 'closing_control'] and not s.rescue)
            if session:
                wp_config.wp_session_username = session[0].user_id.name
                wp_config.wp_session_state = session[0].state
                wp_config.wp_session_duration = (
                    datetime.now() - session[0].start_at
                ).days if session[0].start_at else 0
            else:
                wp_config.wp_session_username = False
                wp_config.wp_session_state = False
                wp_config.wp_session_duration = 0

    @api.constrains('company_id', 'stock_location_id')
    def _check_company_location(self):
        if self.stock_location_id.company_id and self.stock_location_id.company_id.id != self.company_id.id:
            raise ValidationError(_("The stock location and the Weighing Point must belong to the same company."))

    @api.constrains('pricelist_id', 'available_pricelist_ids')
    def _check_currencies(self):
        if self.pricelist_id not in self.available_pricelist_ids:
            raise ValidationError(_("The default pricelist must be included in the available pricelists."))
        if any(self.available_pricelist_ids.mapped(lambda pricelist: pricelist.currency_id != self.currency_id)):
            raise ValidationError(_("All available pricelists must be in the same currency as the company"))

    @api.constrains('company_id', 'available_pricelist_ids')
    def _check_companies(self):
        if any(self.available_pricelist_ids.mapped(lambda pl: pl.company_id.id not in (False, self.company_id.id))):
            raise ValidationError(_("The selected pricelists must belong to no company or the company of the Weighing Point."))

    @api.onchange('iface_print_via_proxy')
    def _onchange_iface_print_via_proxy(self):
        self.iface_print_auto = self.iface_print_via_proxy


    @api.onchange('use_pricelist')
    def _onchange_use_pricelist(self):
        """
        If the 'pricelist' box is unchecked, we reset the pricelist_id to stop
        using a pricelist for this iotbox.
        """
        if not self.use_pricelist:
            self.pricelist_id = self._default_pricelist()

    @api.onchange('available_pricelist_ids')
    def _onchange_available_pricelist_ids(self):
        if self.pricelist_id not in self.available_pricelist_ids:
            self.pricelist_id = False

    @api.onchange('iface_scan_via_proxy')
    def _onchange_iface_scan_via_proxy(self):
        if self.iface_scan_via_proxy:
            self.barcode_scanner = True
        else:
            self.barcode_scanner = False

    @api.onchange('barcode_scanner')
    def _onchange_barcode_scanner(self):
        if self.barcode_scanner:
            self.barcode_nomenclature_id = self.env.user.company_id.nomenclature_id
        else:
            self.barcode_nomenclature_id = False

    @api.onchange('is_iotbox')
    def _onchange_is_iotbox(self):
        if not self.is_iotbox:
            self.proxy_ip = False
            self.iface_scan_via_proxy = False
            self.iface_electronic_scale = False
            self.iface_print_via_proxy = False

    @api.onchange('tax_regime')
    def _onchange_tax_regime(self):
        if not self.tax_regime:
            self.default_fiscal_position_id = False

    @api.onchange('tax_regime_selection')
    def _onchange_tax_regime_selection(self):
        if not self.tax_regime_selection:
            self.fiscal_position_ids = [(5, 0, 0)]

    @api.onchange('start_category')
    def _onchange_start_category(self):
        if not self.start_category:
            self.iface_start_categ_id = False

    @api.onchange('is_header_or_footer')
    def _onchange_header_footer(self):
        if not self.is_header_or_footer:
            self.receipt_header = False
            self.receipt_footer = False

    @api.multi
    def name_get(self):
        result = []
        for config in self:
            last_session = self.env['wp.session'].search([('config_id', '=', config.id)], limit=1)
            if (not last_session) or (last_session.state == 'closed'):
                result.append((config.id, config.name + ' (' + _('not used') + ')'))
                continue
            result.append((config.id, config.name + ' (' + last_session.user_id.name + ')'))
        return result

    @api.model
    #TODO(Vincent) understand
    def create(self, values):
        IrSequence = self.env['ir.sequence'].sudo()
        val = {
            'name': _('wp Order %s') % values['name'],
            'padding': 4,
            'prefix': "%s/" % values['name'],
            'code': "wp.order",
            'company_id': values.get('company_id', False),
        }

        # force sequence_id field to new wp.order sequence
        values['sequence_id'] = IrSequence.create(val).id

        val.update(name=_('wp order line %s') % values['name'], code='wp.order.line')
        values['sequence_line_id'] = IrSequence.create(val).id
        wp_config = super(WpConfig, self).create(values)
        wp_config.sudo()._check_modules_to_install()
        wp_config.sudo()._check_groups_implied()
        # If you plan to add something after this, use a new environment.
        # The one above is no longer valid after the modules install.
        return wp_config

    #TODO(Vincent) understand
    @api.multi
    def write(self, vals):
        result = super(WpConfig, self).write(vals)

        config_display = self.filtered(lambda c: c.is_iotbox and c.iface_customer_facing_display and not (c.customer_facing_display_html or '').strip())
        if config_display:
            super(WpConfig, config_display).write({'customer_facing_display_html': self._compute_default_customer_html()})

        self.sudo()._set_fiscal_position()
        self.sudo()._check_modules_to_install()
        self.sudo()._check_groups_implied()
        return result

    @api.multi
    def unlink(self):
        for wp_config in self.filtered(lambda wp_config: wp_config.sequence_id or wp_config.sequence_line_id):
            wp_config.sequence_id.unlink()
            wp_config.sequence_line_id.unlink()
        return super(WpConfig, self).unlink()

    def _check_modules_to_install(self):
        module_installed = False
        for wp_config in self:
            for field_name in [f for f in wp_config.fields_get_keys() if f.startswith('module_')]:
                module_name = field_name.split('module_')[1]
                module_to_install = self.env['ir.module.module'].sudo().search([('name', '=', module_name)])
                if getattr(wp_config, field_name) and module_to_install.state not in ('installed', 'to install', 'to upgrade'):
                    module_to_install.button_immediate_install()
                    module_installed = True
        # just in case we want to do something if we install a module. (like a refresh ...)
        return module_installed

    def _check_groups_implied(self):
        for wp_config in self:
            for field_name in [f for f in wp_config.fields_get_keys() if f.startswith('group_')]:
                field = wp_config._fields[field_name]
                if field.type in ('boolean', 'selection') and hasattr(field, 'implied_group'):
                    field_group_xmlids = getattr(field, 'group', 'base.group_user').split(',')
                    field_groups = self.env['res.groups'].concat(*(self.env.ref(it) for it in field_group_xmlids))
                    field_groups.write({'implied_ids': [(4, self.env.ref(field.implied_group).id)]})


    def execute(self):
        return {
             'type': 'ir.actions.client',
             'tag': 'reload',
             'params': {'wait': True}
         }

    # Methods to open the wp
    @api.multi
    def open_ui(self):
        """ open the wp interface """
        self.ensure_one()
        return {
            'type': 'ir.actions.act_url',
            'url':   '/wp/web/',
            'target': 'self',
        }

    @api.multi
    def open_session_cb(self):
        """ new session button

        create one if none exist
        access cash control interface if enabled or start a session
        """
        self.ensure_one()
        if not self.current_session_id:
            self.current_session_id = self.env['wp.session'].create({
                'user_id': self.env.uid,
                'config_id': self.id
            })
            if self.current_session_id.state == 'opened':
                return self.open_ui()
            return self._open_session(self.current_session_id.id)
        return self._open_session(self.current_session_id.id)

    @api.multi
    def open_existing_session_cb(self):
        """ close session button

        access session form to validate entries
        """
        self.ensure_one()
        return self._open_session(self.current_session_id.id)

    def _open_session(self, session_id):
        return {
            'name': _('Session'),
            'view_type': 'form',
            'view_mode': 'form,tree',
            'res_model': 'wp.session',
            'res_id': session_id,
            'view_id': False,
            'type': 'ir.actions.act_window',
        }
