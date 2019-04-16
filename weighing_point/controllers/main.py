# -*- coding: utf-8 -*-
import json
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
