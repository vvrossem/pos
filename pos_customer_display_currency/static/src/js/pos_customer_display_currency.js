/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('pos_customer_display_currency.pos_customer_display_currency', function (require) {
    "use strict";
    var chrome = require('point_of_sale.chrome');
    var core = require('web.core');
    var devices = require('point_of_sale.devices');
    var gui = require('point_of_sale.gui');
    var models = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');
    var _t = core._t;

    models.PosModel = models.PosModel.extend({

        prepare_text_customer_display: function (type, data) {
            if (this.config.iface_customer_display != true)
                return;
            var line_length = this.config.customer_display_line_length || 20;
            var currency_rounding = this.currency.decimals;
            var currency_char = this.config.customer_display_currency_char;

            if (type == 'add_update_line') {
                var line = data['line'];
                var price_unit = line.get_unit_price();
                var discount = line.get_discount();
                if (discount) {
                    price_unit = price_unit * (1.0 - (discount / 100.0));
                }
                price_unit = price_unit.toFixed(currency_rounding);
                var qty = line.get_quantity();
                // only display decimals when qty is not an integer
                if (qty.toFixed(0) == qty) {
                    qty = qty.toFixed(0);
                }
                // only display unit when != Unit(s)
                var unit = line.get_unit();
                var unit_display = '';
                if (unit && !unit.is_unit) {
                    unit_display = unit.name;
                }
                var l21 = qty + unit_display + ' x ' + price_unit;
                var l22 = ' ' + line.get_display_price().toFixed(currency_rounding) + currency_char;
                var lines_to_send = new Array(
                    this.proxy.align_left(line.get_product().display_name, line_length),
                    this.proxy.align_left(l21, line_length - l22.length) + l22
                );

            } else if (type == 'remove_orderline') {
                // first click on the backspace button set the amount to 0 => we can't precise the deleted qunatity and price
                var line = data['line'];
                var lines_to_send = new Array(
                    this.proxy.align_left(_t("Delete Item"), line_length),
                    this.proxy.align_right(line.get_product().display_name, line_length)
                );

            } else if (type == 'add_paymentline') {
                var total = this.get('selectedOrder').get_total_with_tax().toFixed(currency_rounding);
                var lines_to_send = new Array(
                    this.proxy.align_left(_t("TOTAL: "), line_length),
                    this.proxy.align_right(total + currency_char, line_length)
                );

            } else if (type == 'remove_paymentline') {
                var line = data['line'];
                var amount = line.get_amount().toFixed(currency_rounding);
                var lines_to_send = new Array(
                    this.proxy.align_left(_t("Cancel Payment"), line_length),
                    this.proxy.align_right(line.cashregister.journal_id[1], line_length - 1 - amount.length) + ' ' + amount
                );

            } else if (type == 'update_payment') {
                var change = data['change'];
                var lines_to_send = new Array(
                    this.proxy.align_left(_t("Your Change:"), line_length),
                    this.proxy.align_right(change, line_length)
                );

            } else if (type == 'push_order') {
                var lines_to_send = new Array(
                    this.proxy.align_center(this.config.customer_display_msg_next_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_next_l2, line_length)
                );

            } else if (type == 'openPOS') {
                var lines_to_send = new Array(
                    this.proxy.align_center(this.config.customer_display_msg_next_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_next_l2, line_length)
                );

            } else if (type = 'closePOS') {
                var lines_to_send = new Array(
                    this.proxy.align_center(this.config.customer_display_msg_closed_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_closed_l2, line_length)
                );
            } else {
                console.warn('Unknown message type');
                return;
            }

            this.proxy.send_text_customer_display(lines_to_send, line_length);
        },

        prepare_currency_data_customer_display: function () {
            // TODO(Vincent) currency_code = this.currency.name || this.company_currency.name ?
            var currency_data = {
                'currency_code': this.currency.name,
                'currency_char': this.config.customer_display_currency_char
            }

            this.proxy.send_currency_data_customer_display(currency_data);
        }
    });


    devices.ProxyDevice = devices.ProxyDevice.extend({
        send_currency_data_customer_display: function (currency_data) {
            return this.message('send_currency_data_customer_display', {'currency_data': JSON.stringify(currency_data)});
        },
    });

    // TODO(Vincent) is it the best place to fetch and set currency data?
    chrome.ProxyStatusWidget.include({
        start: function () {
            this._super();
            this.pos.prepare_currency_data_customer_display();
        }
    });

});