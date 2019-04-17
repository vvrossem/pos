/* Copyright 2019 Coop IT Easy SCRLfs - Pierrick Brun
   License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl). */

odoo.define('pos_order_mgmt_container.widgets', function (require) {
    "use strict";

    var screens = require('pos_order_mgmt.widgets');
	var pos = require('pos_container.models_and_db');

    screens.OrderListScreenWidget.include({
        _prepare_orderlines_from_order_data: function (order, order_data, orderLines) {
			var self = this;
			_.each(orderLines, function(line) {
				// In case of local data
				if (line.length === 3) {
					line = line[2];
				}
				var product = self.pos.db.get_product_by_id(line.product_id);

				if (line['container_id']){
					var container = self.pos.db.get_container_by_id(line.container_id);
				}
				// Check if product are available in pos
				if (_.isUndefined(product)) {
					self.unknown_products.push(String(line.product_id));
				} else {
					// Create a new order line
					order.add_product(product, {
						price: line.price_unit,
						quantity: order_data.return ? line.qty * -1 : line.qty,
						discount: line.discount,
						merge: false,
					});
					var oline = order.get_last_orderline();
					if (line.tare){
						oline.set_tare(line.tare);
						// cancels set_tare quantity substraction
						oline.set_quantity(line.qty);
					}
					if (line.tare || line.discount || line.price_unit != product.lst_price) {
						oline.set_tare_mode('MAN');
					}
					if(!_.isUndefined(container)){
						oline.set_container(container);
						oline.set_gross_weight(line.qty + line.container_weight);
						oline.set_quantity(line.qty);
						oline.set_tare_mode('AUTO');
					}
				}
			});
        },
	});

});
