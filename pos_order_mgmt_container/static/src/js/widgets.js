/* Copyright 2019 Coop IT Easy SCRLfs - Pierrick Brun
   License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl). */

odoo.define('pos_order_mgmt_container.widgets', function (require) {
    "use strict";

    var screens = require('pos_order_mgmt.widgets');
    var pos = require('pos_container.models_and_db');

    screens.OrderListScreenWidget.include({
        _prepare_orderlines_from_order_data: function (
            order, order_data, action) {
            var orderLines = order_data.line_ids || order_data.lines || [];

            var self = this;
            _.each(orderLines, function (orderLine) {
                var line = orderLine;
                // In case of local data
                if (line.length === 3) {
                    line = line[2];
                }
                var product = self.pos.db.get_product_by_id(line.product_id);

				//ADDITION
                if (line['container_id']){
                    var container = self.pos.db.get_container_by_id(line.container_id);
                }
				//ADDITION END

                // Check if product are available in pos
                if (_.isUndefined(product)) {
                    self.unknown_products.push(String(line.product_id));
                } else {
                    var qty = line.qty;
					var container_weight = line.container_weight || 0
                    if (['return'].indexOf(action) !== -1) {
                        // Invert line quantities
                        qty *= -1;
                        container_weight *= -1;
                    }
                    // Create a new order line
                    order.add_product(product, {
                        price: line.price_unit,
                        quantity: qty,
                        discount: line.discount,
                        merge: false,
                    });

					// ADDITION
                    var oline = order.get_last_orderline();
                    if (line.tare){
                        oline.set_tare(line.tare);
                        // cancels set_tare quantity substraction
                        oline.set_quantity(qty, true);
                    }
                    if(!_.isUndefined(container)){
                        oline.set_container(container);
                        oline.set_gross_weight(qty + container_weight);
                        oline.set_quantity(qty, true);
                        oline.set_tare_mode('AUTO');
                    }
                    if (line.tare || line.discount || line.price_unit != product.lst_price) {
                        oline.set_tare_mode('MAN');
                    }
					// ADDITION END
                }
            });
        },
    });

});
