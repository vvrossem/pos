# -*- coding: utf-8 -*-
import json
import decimal
import logging
import werkzeug.utils

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


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
    @http.route('/printer_zpl2/print_test_label', type='json')
    def print_test_label(self, container_weight):
        _logger.info('container_weight: %s', container_weight)
        if container_weight == 0:
            return 'no weight'

        #TODO(Vincent) improve into something more generic
        zebra_printer = request.env['printing.printer'].search([('name', 'ilike', '%zebra%')])
        if not zebra_printer:
            return 'no zebra printer'

        zpl2_labels = request.env['printing.label.zpl2']
        container_label = zpl2_labels.search([('name', '=', 'container')])
        if not container_label:
            return 'no container label'
        _logger.info('%s', container_label.id)
        #container_label.print_test_label()

        #TODO(Vincent) comprendre la logique de création du wizard
        WizardImportZPl2 = request.env['wizard.import.zpl2']
        for wizard in WizardImportZPl2:
            _logger.info('%s', wizard)
            wizard.label_id = container_label.id
            wizard.delete_component = True
            wizard.data = '^FO100,550^BE^FD2900001' + str(container_weight) + '^FS'
            wizard.import_zpl2()


