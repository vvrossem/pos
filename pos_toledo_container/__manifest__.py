# Copyright 2019 Coop IT Easy SCRLfs
# 	    Robin Keunen <robin@coopiteasy.be>
#       Vincent Van Rossem <vvrossem@gmail.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
{
    'name': "POS Toledo Container Weighing",
    'version': '12.0.1.0.0',

    'summary':
        """
        Creates a container after it is lifted from a Mettler-Toledo scale
        """,

    'description':
        """
        The Mettler-Toledo scale has to be configured with the Checkout-Dialogue 06 communication protocol, 
        as described in the Service Manual:
            https://www.manualslib.com/manual/861274/Mettler-Toledo-Viva.html?page=42#manual

       Once the scale answers with a 30 or 31 status code and the weight value is different than zero, 
       the products screen is shown with the created container.
       
       Use pos_toledo_product module to order a weighted product once it is lifted from the scale.
        """,

    "author": "Coop IT Easy SCRLfs, "
              "Odoo Community Association (OCA)",
    'website': "https://odoo-community.org/",

    'category': 'Point of Sale',

    'depends': ['pos_container'],

    'data': [
        'templates/templates.xml',
    ],
}
