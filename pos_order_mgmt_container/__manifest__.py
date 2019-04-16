{
    "name": "PoS Order Management Container",
    "summary": "Glue module for pos_order_mgmt and pos_container",
    "version": " 12.0.1.0.0",
    "category": "Point of sale",
    "website": "https://github.com/OCA/pos",
    "author": "Coop IT Easy SCRLfs",
    "license": "AGPL-3",
    "application": False,
    "installable": True,
    "depends": [
        "pos_order_mgmt",
        "pos_container",
    ],
    "data": [
        "templates/templates.xml",
    ],
    "auto_install": True,
}
