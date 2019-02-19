# Copyright 2019 Coop IT Easy SCRLfs
# 	    Robin Keunen <robin@coopiteasy.be>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).{
{
    'name': "POS Container",
    'version': '12.0.1.0.0',

    'summary': """
        Allows managing pre-weighted containers for bulk shop""",

    "author": "Coop IT Easy SCRLfs, "
              "Odoo Community Association (OCA)",
    'website': "https://odoo-community.org/",

    'category': 'Point of Sale',

    'depends': ['point_of_sale'],

    'data': [
        # 'security/ir.model.access.csv',
        # 'views/views.xml',
        # 'views/templates.xml',
    ],
    # only loaded in demonstration mode
    'demo': [
        # 'demo/demo.xml',
    ],
    'installable': True,
}
