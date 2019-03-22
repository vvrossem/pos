# Copyright 2019 Coop IT Easy SCRLfs
# 	    Vincent Van Rossem <vvrossem@gmail.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).{
{
    'name': "Weighing Point",
    'version': '12.0.1.0.0',

    'summary': 'Allows customers to weigh their bulk products',
    'description': """TODO""",

    "author": "Coop IT Easy SCRLfs, "
              "Odoo Community Association (OCA)",
    'license': "AGPL-3",

    'category': 'Point of Sale',

    'depends': ['point_of_sale'],

    'data': ['templates/templates.xml'],
    'demo': [],

    'qweb': [
        'static/src/xml/weighing_point.xml',
        'static/src/xml/categories.xml',
        'static/src/xml/products.xml',
        'static/src/xml/startup_screen.xml',
        'static/src/xml/weigh_container_screen.xml',
        'static/src/xml/scan_container_screen.xml',
        'static/src/xml/scale_widget.xml',
    ],

    'installable': True,
    'application': False,
}
