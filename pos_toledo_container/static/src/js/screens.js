/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Robin Keunen <robin@coopiteasy.be>
    	    Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('pos_toledo_container.screens', function (require) {
    "use strict";

    var screens = require('pos_container.container');

    screens.ContainerScaleScreenWidget.include({
        show: function () {
            var self = this;
            var queue = this.pos.proxy_queue;
            var priceStr = '001000'; // bizerba doesn't accept '000000' as unit price

            this.pos.proxy.reset_weight().then(function(response){
                self.set_weight(0);
            });
            this.renderElement();

            queue.schedule(function () {
                return self.pos.proxy.scale_read_data_price(priceStr).then(function (scale_answer) {
                    self.set_weight(scale_answer.weight);
                    if ((scale_answer.error === '30' || scale_answer.error === '31') && scale_answer.weight !== 0) {
                        self.gui.show_screen(self.next_screen);
                        self.create_container();
                    }
                });
            }, {duration: 500, repeat: true});
            this._super();
        },
    });
});
