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
        /**
         * Prepare and send the currency data to the customer display device
         */
        prepare_currency_data_customer_display: function () {
            var currency_data = {
                'currency_code': this.currency.name || this.company_currency.name,
                'currency_char': this.config.customer_display_currency_char
            };
            this.proxy.send_currency_data_customer_display(currency_data);
        },

        /**
         * Prepare and send a text to the customer display device according to param type
         * @override prepare_text_customer_display from customer_display.js (module pos_customer_display)
         * @param {string} type
         * @param data
         */
        prepare_text_customer_display: function (type, data) {
            if (!this.config.iface_customer_display)
                return;
            var line_length = this.config.customer_display_line_length || 20;
            var currency_rounding = this.currency.decimals;
            var currency_char = this.config.customer_display_currency_char;
            var previous_lines_to_send, lines_to_send, total_lines = [];
            var line, product, container = {};
            var l21 = "";
            var l22 = "";
            var total = "";
            var mode = $('.selected-mode').attr('data-mode'); // numpad selected mode

            switch(type) {
                case 'add_update_line':
                    line = data['line'];
                    if (mode === 'quantity') {
                        l21 = line.get_quantity_str_with_uom()
                            + ' x '
                            + line.get_unit_price_with_uom_currency(currency_char, currency_rounding);
                        l22 = ' ' + line.get_display_price().toFixed(currency_rounding) + currency_char;
                        lines_to_send = [
                            this.proxy.align_left(line.get_product().display_name, line_length - l22.length) + l22,
                            this.proxy.align_left(l21, line_length)
                        ];

                    } else if (mode === 'discount') {
                        // display discount information
                        var discount = line.get_discount();
                        product = line.get_product();
                        l22 = ' ' + line.get_base_price().toFixed(currency_rounding) + currency_char;
                        lines_to_send = [
                            this.proxy.align_left(product.display_name, line_length - l22.length) + l22,
                            this.proxy.align_left(_t("Discount:") + discount + '%', line_length)
                        ];

                    } else if (mode === 'price') {
                        // first display "manual entry"
                        l21 = line.get_quantity_str_with_uom()
                            + ' x '
                            + line.get_unit_price_with_uom_currency(currency_char, currency_rounding);
                        previous_lines_to_send = [
                            this.proxy.align_left(_t('Manual Entry'), line_length),
                            this.proxy.align_right(l21, line_length)
                        ];
                        // then display price information
                        l22 = ' ' + line.get_display_price().toFixed(currency_rounding) + currency_char;
                        lines_to_send = [
                            this.proxy.align_left(line.get_product().display_name, line_length - l22.length) + l22,
                            this.proxy.align_left(l21, line_length)
                        ];

                    } else if (mode === 'tare'){
                        // /!\ container always null because of set_tare() (this.container = null) /!\
                        container = line.get_container();
                        product = line.get_product();
                        var tare = line.get_tare();

                        // first display "manual tare"
                        previous_lines_to_send = [
                            this.proxy.align_left(_t('Manual Tare'), line_length),
                            this.proxy.align_right(tare.toString() + 'kg', line_length)
                        ];

                        // then display price information (only if orderline is a product)
                        if (product && !container){
                            l21 = line.get_quantity_str_with_uom()
                                + ' x '
                                + line.get_unit_price_with_uom_currency(currency_char, currency_rounding);
                            l22 = ' ' + line.get_display_price().toFixed(currency_rounding) + currency_char;
                            lines_to_send = [
                                this.proxy.align_left(line.get_product().display_name, line_length - l22.length) + l22,
                                this.proxy.align_left(l21, line_length)
                            ];
                        }
                    }
                    break;

                case 'add_container':
                    line = data['line'];
                    container = line.get_container();
                    lines_to_send = [
                        this.proxy.align_left(container.name, line_length),
                        this.proxy.align_right(container.weight.toString() + ' kg', line_length)
                    ];
                    break;

                case 'remove_orderline':
                    // first click on the backspace button set the amount to 0 => we can't precise the deleted qunatity and price
                    line = data['line'];
                    container = line.get_container();
                    product = line.get_product();
                    if (container) {
                        lines_to_send = [
                             this.proxy.align_left(_t("Delete Container"), line_length),
                             this.proxy.align_right(container.name, line_length)
                        ];

                    } else if (product) {
                        lines_to_send = [
                            this.proxy.align_left(_t("Delete Item"), line_length),
                            this.proxy.align_right(product.display_name, line_length)
                        ];
                    }
                    break;

                case 'add_paymentline':
                    total = this.get('selectedOrder').get_total_with_tax().toFixed(currency_rounding) + currency_char;
                    lines_to_send = [
                        this.proxy.align_left(_t("TOTAL:"), line_length),
                        this.proxy.align_right(total, line_length)
                    ];
                    break;

                case 'remove_paymentline':
                    line = data['line'];
                    var amount = line.get_amount().toFixed(currency_rounding) + currency_char;
                    lines_to_send = [
                        this.proxy.align_left(_t("Cancel Payment"), line_length),
                        this.proxy.align_right(line.cashregister.journal_id[1], line_length - 1 - amount.length) + ' ' + amount
                    ];
                    break;

                case 'update_payment':
                    var change = data['change'] + currency_char;
                    lines_to_send = [
                        this.proxy.align_left(_t("Your Change:"), line_length),
                        this.proxy.align_right(change, line_length)
                    ];
                    break;

                // same display for both types
                case 'push_order':
                case 'openPOS':
                    lines_to_send = [
                        this.proxy.align_center(this.config.customer_display_msg_next_l1, line_length),
                        this.proxy.align_center(this.config.customer_display_msg_next_l2, line_length)
                    ];
                    break;

                case 'closePOS':
                    lines_to_send = [
                        this.proxy.align_center(this.config.customer_display_msg_closed_l1, line_length),
                        this.proxy.align_center(this.config.customer_display_msg_closed_l2, line_length)
                    ];
                    break;

                default:
                    console.warn('Unknown message type');
                    return;
            }

            var order = this.get('selectedOrder');
            if (order){
                total = order.get_total_with_tax().toFixed(currency_rounding) + currency_char;
                total_lines = [this.proxy.align_left(_t("TOTAL:"), line_length),
                    this.proxy.align_right(total, line_length)
                ];
            }
            if (previous_lines_to_send){
                this.proxy.send_text_customer_display(previous_lines_to_send, line_length);
                setTimeout(function() {this.proxy.send_text_customer_display(lines_to_send, line_length); }.bind(this), 2000);
                if (total_lines){
                    setTimeout(function() {this.proxy.send_text_customer_display(total_lines, line_length); }.bind(this), 4500);
                }
            } else {
                this.proxy.send_text_customer_display(lines_to_send, line_length);
                if (total_lines){
                    setTimeout(function() {this.proxy.send_text_customer_display(total_lines, line_length); }.bind(this), 2500);
                }
            }
        },

    });

    devices.ProxyDevice = devices.ProxyDevice.extend({
        /**
         * Send currency data to the customer display device
         * @param currency_data
         * @returns {*}
         */
        send_currency_data_customer_display: function (currency_data) {
            return this.message('send_currency_data_customer_display',
                {
                    'currency_data': JSON.stringify(currency_data)
                });
        },
    });

    models.Orderline = models.Orderline.extend({
        /**
         * This function is for the Bixolon only
         * Returns quantityStr with or without the name of the unit of measure (uom)
         */
        get_quantity_str_with_uom: function(){
            var unit = this.get_unit();
            if(unit && !unit.is_pos_groupable){
                return this.get_quantity_str() + ' ' + unit.name;
            }else{
                return round_pr(this.get_quantity_str(), 0.1);
            }
        },

        /**
         * This function is for the Bixolon display device only.
         * Returns the unit price with the user-defined currency symbol (default: '$')
         */
        get_unit_price_with_uom_currency: function(currency_char, currency_rounding){
            var unit = this.get_unit();
            if(unit && !unit.is_pos_groupable){
                return this.get_unit_price().toFixed(currency_rounding) + currency_char + '/' + unit.name;
            }else{
                return this.get_unit_price().toFixed(currency_rounding) + currency_char;
            }
        },
    });

    var OrderSuper = models.Order;

    models.Order = models.Order.extend({

        /**
         * @extends add_container from models_and_db.js (module: pos_container)
         */
        add_container: function(container, options){
            // invoke parent object's implementation
            var res = OrderSuper.prototype.add_container.call(this, container, options);
            if (container){
                // parent ends with this.select_orderline(this.get_last_orderline());
                var line = this.get_last_orderline();
                this.pos.prepare_text_customer_display('add_container', {'line': line });
            }
            return res;
        },
    });

    /**
     * Fetch and set currency data when the ProxyStatusWidget starts
     */
    chrome.ProxyStatusWidget.include({
        start: function () {
            this._super();
            this.pos.prepare_currency_data_customer_display();
        }
    });

});