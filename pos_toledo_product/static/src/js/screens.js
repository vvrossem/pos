/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Robin Keunen <robin@coopiteasy.be>
    	    Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('pos_toledo_product.screens', function (require) {
    "use strict";

    var screens = require('point_of_sale.screens');

    screens.ScaleScreenWidget.include({
        show: function () {
            var self = this;
            var queue = this.pos.proxy_queue;

            this.set_weight(0);
            this.renderElement();

            self.pos.proxy.reset_weight();

            queue.schedule(function () {
                return self.pos.proxy.scale_read().then(function (scale_answer) {
                    self.set_weight(scale_answer.weight);
                    if ((scale_answer.info === '30' || scale_answer.info === '31') && scale_answer.weight !== 0) {
                        self.gui.show_screen(self.next_screen);
                        // add product *after* switching screen to scroll properly
                        self.order_product();
                    }
                });
            }, {duration: 500, repeat: true});
            this._super();
        },
    });
});