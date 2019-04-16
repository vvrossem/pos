# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
from odoo.addons.web_editor.controllers.main import Web_Editor


class WebEditorWeighingPoint(Web_Editor):
    @http.route('/weighing_point/field/customer_facing_display_template', type='http', auth="user")
    def get_field_text_html(self, model=None, res_id=None, field=None, callback=None, **kwargs):
        kwargs['snippets'] = '/weighing_point/snippets'
        kwargs['template'] = 'weighing_point.FieldTextHtml'
        extra_head = request.env.ref('weighing_point.extra_head').render(None)
        
        return self.FieldTextHtml(model=model, res_id=res_id, field=field, callback=callback, head=extra_head, **kwargs)

    @http.route(['/weighing_point/snippets'], type='json', auth="user", website=True)
    def get_snippets(self):
        return request.env.ref('weighing_point.customer_facing_display_snippets').render(None)
