# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'Weighing Point',
    'version': '12.0.1.0.0',
    'category': 'Weighing Point',
    'summary': 'Weighing Point for bulk shops',
    'description': "Allow bulk shop customers to weigh their products or containers...",
    'depends': ['stock_account', 'barcodes', 'web_editor'],
    'data': [
        'security/weighing_point_security.xml',
        'security/ir.model.access.csv',
        'data/default_barcode_patterns.xml',
        'views/wp_templates.xml',
        'views/weighing_point_template.xml',
        'views/weighing_point_view.xml',
        'views/wp_order_view.xml',
        'views/wp_category_view.xml',
        'views/product_view.xml',
        'views/account_journal_view.xml',
        'views/wp_config_view.xml',
        'views/wp_session_view.xml',
        'views/weighing_point_sequence.xml',
        'views/weighing_point.xml',
        'data/weighing_point_data.xml',
        'views/account_statement_view.xml',
        'views/res_config_settings_views.xml',
        'views/res_partner_view.xml',
        'views/res_users_views.xml',
        'views/weighing_point_dashboard.xml',
    ],
    'demo': [
        'data/weighing_point_demo.xml',
    ],
    'installable': True,
    'application': True,
    'qweb': ['static/src/xml/wp.xml'],
}
