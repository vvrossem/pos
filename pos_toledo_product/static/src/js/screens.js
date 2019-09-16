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
        set_price: function(price){
            this.price = price;
            this.$('.price').text(this.format_currency(price));
            this.$('.computed-price').text(this.format_currency(price));
        },

        get_price: function(){
            return this.price;
        },

        get_computed_price_string: function(){
            return this.format_currency(this.price);
        },

        set_weight: function(weight){
            this.weight = weight;
            this.$('.weight').text(this.get_product_weight_string());
        },

        format_tare: function (container) {
            var tare = (Math.abs(container.weight) * 1000).toString();
            while (tare.length < 4) {
                tare = '0' + tare;
            }
            tare = tare.substring(0, 4);
            return tare;

        },

        format_price: function (product_price) {
            var price = (product_price * 1000).toString();
            while (price.length < 6) {
                price = '0' + price
            }
            price = price.substring(0, 6);
            return price;

        },

        show: function () {
            var self = this;
            var queue = this.pos.proxy_queue;
            var container = this.gui.get_current_screen_param('container')

            this.set_weight(0);
            this.set_price(0);
            this.renderElement();

            self.pos.proxy.reset_weight();

            // format price
            var price = this.format_price(this.get_product_price());

            if (container) {
                // format tare
                var tare = this.format_tare(container);
                queue.schedule(function () {
                    return self.pos.proxy.scale_read_data_price_tare(price, tare).then(function (scale_answer) {
                        self.set_weight(scale_answer.weight);
                        self.set_price(scale_answer.price);
                        if ((scale_answer.error === '30' || scale_answer.error === '31') && scale_answer.weight !== 0) {
                            self.gui.show_screen(self.next_screen);
                            // add product *after* switching screen to scroll properly
                            self.order_product();
                            self.pos.proxy.reset_tare();
                        }
                    });
                }, {duration: 500, repeat: true});

            } else {
                queue.schedule(function () {
                    return self.pos.proxy.scale_read_data_price(price).then(function (scale_answer) {
                        self.set_weight(scale_answer.weight);
                        self.set_price(scale_answer.price);
                        if ((scale_answer.error === '30' || scale_answer.error === '31') && scale_answer.weight !== 0) {
                            self.gui.show_screen(self.next_screen);
                            // add product *after* switching screen to scroll properly
                            self.order_product();
                        }
                    });
                }, {duration: 500, repeat: true});
            }
            this._super();
        },
    });
});