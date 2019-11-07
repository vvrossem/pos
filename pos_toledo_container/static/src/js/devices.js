/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Robin Keunen <robin@coopiteasy.be>
    	    Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('pos_toledo_container.devices', function (require) {
    "use strict";

    var devices = require('point_of_sale.devices');

    devices.ProxyDevice.include({
        reset_weight: function () {
            return this.message('reset_weight');
        },
    });
});
