/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('pos_customer_display_currency.pos_customer_display_currency', function (require) {
    "use strict";
    var chrome = require('point_of_sale.chrome');
    var core = require('web.core');
    var utils = require('web.utils')
    var devices = require('point_of_sale.devices');
    var gui = require('point_of_sale.gui');
    var models = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');
    var _t = core._t;

    var round_pr = utils.round_precision;


    models.PosModel = models.PosModel.extend({

        prepare_text_customer_display: function (type, data) {
            //console.log(this);
            if (!this.config.iface_customer_display)
                return;

            var line_length = this.config.customer_display_line_length || 20;
            var currency_rounding = this.currency.decimals;
            var currency_char = this.config.customer_display_currency_char;
            var lines_to_send = [];
            var line = {};

            if (type === 'add_update_line') {
                console.log('add_update_line');
                line = data['line'];
                var price_unit = (line.get_unit_price() * (1.0 - (line.get_discount() / 100.0)))
                                    .toFixed(currency_rounding);

                var l21 = line.get_quantity_str_with_unit() + ' x ' + line.get_unit_price_with_unit(currency_char);
                var l22 = ' ' + line.get_display_price().toFixed(currency_rounding) + currency_char;
                lines_to_send = [
                    this.proxy.align_left(line.get_product().display_name, line_length - l22.length) + l22,
                    this.proxy.align_left(l21, line_length)
                    ];

            } else if (type === 'remove_orderline') {
                console.log('remove_orderline');
                // first click on the backspace button set the amount to 0 => we can't precise the deleted qunatity and price
                line = data['line'];
                lines_to_send = [this.proxy.align_left(_t("Delete Item"), line_length),
                    this.proxy.align_right(line.get_product().display_name, line_length)];

            } else if (type === 'add_paymentline') {
                console.log('add_paymentline');
                var total = this.get('selectedOrder').get_total_with_tax().toFixed(currency_rounding) + currency_char;
                lines_to_send = [this.proxy.align_left(_t("TOTAL: "), line_length),
                    this.proxy.align_right(total, line_length)];

            } else if (type === 'remove_paymentline') {
                console.log('remove_paymentline');
                line = data['line'];
                var amount = line.get_amount().toFixed(currency_rounding) + currency_char;
                lines_to_send = [this.proxy.align_left(_t("Cancel Payment"), line_length),
                    this.proxy.align_right(line.cashregister.journal_id[1], line_length - 1 - amount.length) + ' ' + amount];

            } else if (type === 'update_payment') {
                console.log('update_payment');
                var change = data['change'] + currency_char;
                lines_to_send = [this.proxy.align_left(_t("Your Change:"), line_length),
                    this.proxy.align_right(change, line_length)];

            } else if (type === 'push_order') {
                console.log('push_order');
                lines_to_send = [this.proxy.align_center(this.config.customer_display_msg_next_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_next_l2, line_length)];

            } else if (type === 'openPOS') {
                console.log('openPOS');
                lines_to_send = [this.proxy.align_center(this.config.customer_display_msg_next_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_next_l2, line_length)];

            } else if (type === 'closePOS') {
                console.log('closePOS');
                lines_to_send = [this.proxy.align_center(this.config.customer_display_msg_closed_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_closed_l2, line_length)];
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
            };

            this.proxy.send_currency_data_customer_display(currency_data);
        }
    });

    devices.ProxyDevice = devices.ProxyDevice.extend({
        send_currency_data_customer_display: function (currency_data) {
            return this.message('send_currency_data_customer_display', {'currency_data': JSON.stringify(currency_data)});
        },
    });

    var OrderlineSuper = models.Orderline;

    models.Orderline = models.Orderline.extend({
        get_quantity_str_with_unit: function(){
            var unit = this.get_unit();
            console.log(unit);
            if(unit && !unit.is_pos_groupable){
                return this.quantityStr + ' ' + unit.name;
            }else{
                return round_pr(this.quantityStr, 0.1);
            }
        },
        // only for bixolon display
        get_unit_price_with_unit: function(currency_char){
            var unit = this.get_unit();
            if(unit && !unit.is_pos_groupable){
                return this.get_unit_price() + currency_char + '/' + unit.name;
            }else{
                return this.get_unit_price()  + currency_char;
            }
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