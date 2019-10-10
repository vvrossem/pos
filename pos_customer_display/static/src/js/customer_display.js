/*
    © 2014-2016 Aurélien DUMAINE
    © 2014-2016 Barroux Abbey (www.barroux.org)
    © 2014-2016 Akretion (www.akretion.com)
    © 2019 Coop IT Easy SCRLfs
    @author: Aurélien DUMAINE
    @author: Alexis de Lattre <alexis.delattre@akretion.com>
    @author: Father Odilon (Barroux Abbey)
    @author: Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl).
*/

odoo.define('pos_customer_display.pos_customer_display', function (require) {
    "use strict";
    var chrome = require('point_of_sale.chrome');
    var core = require('web.core');
    var devices = require('point_of_sale.devices');
    var gui = require('point_of_sale.gui');
    var models = require('point_of_sale.models');
    var screens = require('point_of_sale.screens');
    var _t = core._t;

    var PosModelSuper = models.PosModel;

    models.PosModel = models.PosModel.extend({

        /**
         * Allows the connection to proxy device if iface_customer_display is checked in the POS config
         * Otherwise, no connection is established
         *
         */
        initialize: function (session, attributes) {
            // find 'pos.config' in PosModel models list
            var posConfig = _.find(this.models, function (model) {
                return model.model === 'pos.config';
            });

            // override loaded function to add iface_customer_display
            posConfig.loaded = function (self, configs) {
                self.config = configs[0];
                self.config.use_proxy = self.config.iface_payment_terminal ||
                    self.config.iface_electronic_scale ||
                    self.config.iface_print_via_proxy ||
                    self.config.iface_scan_via_proxy ||
                    self.config.iface_cashdrawer ||
                    self.config.iface_customer_facing_display ||
                    self.config.iface_customer_display;

                if (self.config.company_id[0] !== self.user.company_id[0]) {
                    throw new Error(_t("Error: The Point of Sale User must belong to the same company as the Point of Sale. You are probably trying to load the point of sale as an administrator in a multi-company setup, with the administrator account set to the wrong company."));
                }

                self.db.set_uuid(self.config.uuid);
                self.set_cashier(self.get_cashier());
                // We need to do it here, since only then the local storage has the correct uuid
                self.db.save('pos_session_id', self.pos_session.id);

                var orders = self.db.get_orders();
                for (var i = 0; i < orders.length; i++) {
                    self.pos_session.sequence_number = Math.max(self.pos_session.sequence_number, orders[i].data.sequence_number + 1);
                }
            };

            // Inheritance
            return PosModelSuper.prototype.initialize.call(this, session, attributes);
        },

        prepare_text_customer_display: function (type, data) {
            if (this.config.iface_customer_display != true)
                return;
            var line_length = this.config.customer_display_line_length || 20;
            var currency_rounding = this.currency.decimals;

            if (type === 'add_update_line') {
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
                if (unit && !unit.is_pos_groupable) {
                    unit_display = unit.name;
                }
                var l21 = qty + unit_display + ' x ' + price_unit;
                var l22 = ' ' + line.get_display_price().toFixed(currency_rounding);
                var lines_to_send = [this.proxy.align_left(line.get_product().display_name, line_length),
                    this.proxy.align_left(l21, line_length - l22.length) + l22];

            } else if (type === 'remove_orderline') {
                // first click on the backspace button set the amount to 0 => we can't precise the deleted qunatity and price
                var line = data['line'];
                var lines_to_send = [this.proxy.align_left(_t("Delete Item"), line_length),
                    this.proxy.align_right(line.get_product().display_name, line_length)];

            } else if (type === 'add_paymentline') {
                var total = this.get('selectedOrder').get_total_with_tax().toFixed(currency_rounding);
                var lines_to_send = [this.proxy.align_left(_t("TOTAL: "), line_length),
                    this.proxy.align_right(total, line_length)];

            } else if (type === 'remove_paymentline') {
                var line = data['line'];
                var amount = line.get_amount().toFixed(currency_rounding);
                var lines_to_send = [this.proxy.align_left(_t("Cancel Payment"), line_length),
                    this.proxy.align_right(line.cashregister.journal_id[1], line_length - 1 - amount.length) + ' ' + amount];

            } else if (type === 'update_payment') {
                var change = data['change'];
                var lines_to_send = [this.proxy.align_left(_t("Your Change:"), line_length),
                    this.proxy.align_right(change, line_length)];

            } else if (type === 'push_order') {
                var lines_to_send = [this.proxy.align_center(this.config.customer_display_msg_next_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_next_l2, line_length)];

            } else if (type === 'openPOS') {
                var lines_to_send = [this.proxy.align_center(this.config.customer_display_msg_next_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_next_l2, line_length)];

            } else if (type = 'closePOS') {
                var lines_to_send = [this.proxy.align_center(this.config.customer_display_msg_closed_l1, line_length),
                    this.proxy.align_center(this.config.customer_display_msg_closed_l2, line_length)];
            } else {
                console.warn('Unknown message type');
                return;
            }

            this.proxy.send_text_customer_display(lines_to_send, line_length);
        },

        push_order: function (order) {
            var res = PosModelSuper.prototype.push_order.call(this, order);
            if (order) {
                this.prepare_text_customer_display('push_order', {'order': order});
            }
            return res;
        },
    });

    devices.ProxyDevice = devices.ProxyDevice.extend({
        send_text_customer_display: function (data, line_length) {
            //FIXME : this function is call twice. The first time, it is not called by prepare_text_customer_display : WHY ?
            if (_.isEmpty(data) || data.length != 2 || data[0].length != line_length || data[1].length != line_length) {
                console.warn("send_text_customer_display: Bad Data argument. Data=" + data + ' line_length=' + line_length);
            } else {
                return this.message('send_text_customer_display', {'text_to_display': JSON.stringify(data)});
            }
        },

        align_left: function (string, length) {
            if (string) {
                if (string.length > length) {
                    string = string.substring(0, length);
                } else if (string.length < length) {
                    while (string.length < length)
                        string = string + ' ';
                }
            } else {
                string = ' ';
                while (string.length < length)
                    string = ' ' + string;
            }
            return string;
        },

        align_right: function (string, length) {
            if (string) {
                if (string.length > length) {
                    string = string.substring(0, length);
                } else if (string.length < length) {
                    while (string.length < length)
                        string = ' ' + string;
                }
            } else {
                string = ' ';
                while (string.length < length)
                    string = ' ' + string;
            }
            return string;
        },

        align_center: function (string, length) {
            if (string) {
                if (string.length > length) {
                    string = string.substring(0, length);
                } else if (string.length < length) {
                    var ini = (length - string.length) / 2;
                    while (string.length < length - ini)
                        string = ' ' + string;
                    while (string.length < length)
                        string = string + ' ';
                }
            } else {
                string = ' ';
                while (string.length < length)
                    string = ' ' + string;
            }
            return string;
        },
    });

    var OrderlineSuper = models.Orderline;

    models.Orderline = models.Orderline.extend({
        /* set_quantity() is called when you force the qty via the dedicated button
        AND when you create a new order line via add_product().
        So, when you add a product, we call prepare_text_customer_display() twice...
        but I haven't found any good solution to avoid this -- Alexis */
        set_quantity: function (quantity, keep_price) {
            var res = OrderlineSuper.prototype.set_quantity.call(this, quantity, keep_price);
            if (quantity != 'remove') {

                var line = this;
                if (this.selected) {
                    this.pos.prepare_text_customer_display('add_update_line', {'line': line});
                }
            }
            return res;
        },

        set_discount: function (discount) {
            var res = OrderlineSuper.prototype.set_discount.call(this, discount);
            if (discount) {
                var line = this;
                if (this.selected) {
                    this.pos.prepare_text_customer_display('add_update_line', {'line': line});
                }
            }
            return res;
        },

        set_unit_price: function (price) {
            var res = OrderlineSuper.prototype.set_unit_price.call(this, price);
            var line = this;
            if (this.selected) {
                this.pos.prepare_text_customer_display('add_update_line', {'line': line});
            }
            return res;
        },

    });

    var OrderSuper = models.Order;

    models.Order = models.Order.extend({

        /**
         * Add or merge the product to the order lines and select it.
         * @override add_product from models.js (module: point_of_sale)
         */
        add_product: function (product, options) {
            if(this._printed){
                this.destroy();
                return this.pos.get_order().add_product(product, options);
            }
            this.assert_editable();
            options = options || {};
            var attr = JSON.parse(JSON.stringify(product));
            attr.pos = this.pos;
            attr.order = this;
            var line = new models.Orderline({}, {pos: this.pos, order: this, product: product});

            if(options.quantity !== undefined){
                line.set_quantity(options.quantity);
            }

            if(options.price !== undefined){
                line.set_unit_price(options.price);
            }

            //To substract from the unit price the included taxes mapped by the fiscal position
            this.fix_tax_included_price(line);

            if(options.discount !== undefined){
                line.set_discount(options.discount);
            }

            if(options.extras !== undefined){
                for (var prop in options.extras) {
                    line[prop] = options.extras[prop];
                }
            }

            var to_merge_orderline;
            for (var i = 0; i < this.orderlines.length; i++) {
                if(this.orderlines.at(i).can_be_merged_with(line) && options.merge !== false){
                    to_merge_orderline = this.orderlines.at(i);
                }
            }
            if (to_merge_orderline){
                to_merge_orderline.merge(line);
                line = to_merge_orderline
            } else {
                this.orderlines.add(line);
            }
            this.select_orderline(line); // instead of this.select_orderline(this.get_last_orderline());
            this.pos.prepare_text_customer_display('add_update_line', {'line': line});

            if(line.has_product_lot){
                this.display_lot_popup();
            }
        },

        remove_orderline: function (line) {
            if (line) {
                this.pos.prepare_text_customer_display('remove_orderline', {'line': line});
            }
            return OrderSuper.prototype.remove_orderline.call(this, line);
        },

        remove_paymentline: function (line) {
            if (line) {
                this.pos.prepare_text_customer_display('remove_paymentline', {'line': line});
            }
            return OrderSuper.prototype.remove_paymentline.call(this, line);
        },

        add_paymentline: function (cashregister) {
            var res = OrderSuper.prototype.add_paymentline.call(this, cashregister);
            if (cashregister) {
                this.pos.prepare_text_customer_display('add_paymentline', {'cashregister': cashregister});
            }
            return res;
        },

    });

    screens.PaymentScreenWidget.include({
        render_paymentlines: function () {
            var res = this._super();
            var currentOrder = this.pos.get_order();
            if (currentOrder) {
                var paidTotal = currentOrder.get_total_paid();
                var dueTotal = currentOrder.get_total_with_tax();
                var change = paidTotal > dueTotal ? paidTotal - dueTotal : 0;
                if (change) {
                    var change_rounded = change.toFixed(2);
                    this.pos.prepare_text_customer_display('update_payment', {'change': change_rounded});
                }
            }
            return res;
        },

        show: function () {
            this._super();
            this.pos.prepare_text_customer_display('add_paymentline', {});
        },
    });

    gui.Gui.include({
        close: function () {
            this._super();
            this.pos.prepare_text_customer_display('closePOS', {});
        },
    });

    chrome.ProxyStatusWidget.include({
        start: function () {
            this._super();
            this.pos.prepare_text_customer_display('openPOS', {});
        },
    });
});
