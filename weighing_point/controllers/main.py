# -*- coding: utf-8 -*-
import json
import decimal
import logging
import werkzeug.utils

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

CONTAINER_PREFIX = '24'
BARCODE_HEIGHT = '100'
MODULE_WIDTH = '2'
BAR_WIDTH_RATIO = '2.0'

class WpController(http.Controller):

    @http.route('/wp/web', type='http', auth='user')
    def wp_web(self, debug=False, **k):
        # if user not logged in, log him in
        wp_sessions = request.env['wp.session'].search([
            ('state', '=', 'opened'),
            ('user_id', '=', request.session.uid),
            ('rescue', '=', False)])
        if not wp_sessions:
            return werkzeug.utils.redirect('/web#action=weighing_point.action_client_wp_menu')
        wp_sessions.login()
        context = {
            'session_info': json.dumps(request.env['ir.http'].session_info())
        }
        return request.render('weighing_point.index', qcontext=context)


class Zpl2Controller(http.Controller):
    @http.route('/printer_zpl2/print_label', type='json')
    def print_label(self, container_weight):
        #TODO(Vincent) create and update record everytime
        _logger.debug('container_weight: %s', container_weight)

        if container_weight != 0:

            PrinterModel = request.env['printing.printer']
            zebra_printer = PrinterModel.search(
                ['|', ('name', 'ilike', '%zebra%'), ('system_name', 'ilike', '%zebra%')],
                limit=1)
            if not zebra_printer:
                return 'no zebra printer'

            Zpl2Model = request.env['printing.label.zpl2']
            container_label = Zpl2Model.search(
                [('name', 'ilike', '%container%')], #TODO(Vincent) add ('model_id', '=', 'container.container')
                limit=1)
            if not container_label:
                return 'no container label'
            _logger.debug('container_label: %s', container_label)

            Zpl2ComponentModel = request.env['printing.label.zpl2.component']
            container_label_component = Zpl2ComponentModel.search(
                [('label_id', '=', container_label.id)],
                limit=1)
            if not container_label_component:
                return 'no container label component'
            _logger.debug('container_label_component: %s', container_label_component)

            component_vals = {
                'name': 'Container Barcode',
                'label_id': container_label.id,
                'component_type': 'ean-13',
                'data': '"' + CONTAINER_PREFIX + '000010' + str(container_weight) + '000"', ##TODO(Vincent) format container_weight
                'module_width': MODULE_WIDTH,
                'bar_width_ratio': BAR_WIDTH_RATIO,
                'height': BARCODE_HEIGHT,
                'check_digits': 'True',
                'interpretation_line': 'True',
                'interpretation_line_above': 'True',
            }

            container_label_component.write(component_vals) #TODO(Vincent) create or update
            container_label._generate_zpl2_data(zebra_printer)

            product_record = request.env['product.product'].browse(1)
            if not product_record:
                return 'no product record'
            _logger.debug('product_record: %s', product_record)
            container_label.print_label(zebra_printer, product_record)

            return 'ok'

        return 'no weight'
