# -*- coding: utf-8 -*-
# Copyright 2019 Coop IT Easy SCRLfs
# 	    Vincent Van Rossem <vvrossem@gmail.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

{
    'name': 'Currency Management Extension to POS Customer Display',

    'version': '12.0.1.0.0',

    'category': 'Point Of Sale',

    'summary': """
        Add Currency Management to POS Customer Display device""",

    "author": "Coop IT Easy SCRLfs, "
              "Odoo Community Association (OCA)",

    'license': 'AGPL-3',

    'depends': [
        'pos_customer_display'
        ],

    'data': [
        'templates/templates.xml',
        'views/pos_config_view.xml',
        ],

    'demo': [],

    'installable': True,
}
