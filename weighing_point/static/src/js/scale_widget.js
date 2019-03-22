/*
    Copyright 2019 Coop IT Easy SCRLfs
            Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('weighing_point.scale-widget', function (require) {
    "use strict";

    var PosBaseWidget = require('point_of_sale.BaseWidget');

    var gui = require('point_of_sale.gui');
    var chrome = require('point_of_sale.chrome');

    var core = require('web.core');
    var rpc = require('web.rpc');
    var QWeb = core.qweb;
    var _t = core._t;

    // Add the ScaleWidget to the widgets
    chrome.Chrome.include({
        build_widgets: function () {
            this.widgets.push({
                'name':   'scale-widget',
                'widget': ScaleWidget,
                'replace':  '.placeholder-ScaleWidget',
            })
            this._super();
        },
    });

    var ScaleWidget = PosBaseWidget.extend({
        template: 'ScaleWidget',

        init: function(parent, options){
            //console.log("\t[SCALE_WIDGET][init]");
            var self = this;
            this._super(parent, options);

            var queue = this.pos.proxy_queue;

            this.set_weight(0);
            this.renderElement();

            queue.schedule(function(){
                return self.pos.proxy.scale_read().then(function(weight){
                    self.set_weight(weight.weight);
                });
            },{duration:500, repeat: true});

        },
        get_product: function(){
            //console.log("[SCALE_WIDGET][get_product]");
            return this.gui.get_current_screen_param('product');
        },
        _get_active_pricelist: function(){
            //console.log("[SCALE_WIDGET][_get_active_pricelist]");
            var current_order = this.pos.get_order();
            var current_pricelist = this.pos.default_pricelist;

            if (current_order) {
                current_pricelist = current_order.pricelist;
            }

            return current_pricelist;
        },
        get_product_name: function(){
            //console.log("[SCALE_WIDGET][get_product_name]");
            var product = this.get_product();
            return (product ? product.display_name : undefined) || 'Unnamed Product';
        },
        get_product_price: function(){
            //console.log("[SCALE_WIDGET][get_product_price]");
            var product = this.get_product();
            var pricelist = this._get_active_pricelist();
            return (product ? product.get_price(pricelist, this.weight) : 0) || 0;
        },
        get_product_uom: function(){
            console.log("[SCALE_WIDGET][get_product_uom]");
            var product = this.get_product();
            if(product){
                return this.pos.units_by_id[product.uom_id[0]].name;
            }else{
                return '';
            }
        },
        set_weight: function(weight){
            //console.log("[SCALE_WIDGET][set_weight]");
            this.weight = weight;
            this.$('.weight').text(this.get_product_weight_string());
            this.$('.computed-price').text(this.get_computed_price_string());
        },
        get_product_weight_string: function(){
            //console.log("[SCALE_WIDGET][get_product_weight_string]");
            var product = this.get_product();
            var defaultstr = (this.weight || 0).toFixed(3) + ' Kg';
            if(!product || !this.pos){
                return defaultstr;
            }
            var unit_id = product.uom_id;
            if(!unit_id){
                return defaultstr;
            }
            var unit = this.pos.units_by_id[unit_id[0]];
            var weight = round_pr(this.weight || 0, unit.rounding);
            var weightstr = weight.toFixed(Math.ceil(Math.log(1.0/unit.rounding) / Math.log(10) ));
            weightstr += ' ' + unit.name;
            return weightstr;
        },
        get_computed_price_string: function(){
            //console.log("[SCALE_WIDGET][get_computed_price_string]");
            return this.format_currency(this.get_product_price() * this.weight);
        },
    });

    return {
        ScaleWidget: ScaleWidget,
    }

});
