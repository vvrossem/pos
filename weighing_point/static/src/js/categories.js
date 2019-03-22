/*
    Copyright 2019 Coop IT Easy SCRLfs
            Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('weighing_point.categories', function (require) {
    "use strict";

    var screens = require('point_of_sale.screens');
    var ProductListWidget = screens.ProductListWidget;
    var ProductCategoriesWidget = screens.ProductCategoriesWidget;

    var gui = require('point_of_sale.gui');
    var chrome = require('point_of_sale.chrome');

    var DomCache = screens.DomCache;

    var core = require('web.core');
    var rpc = require('web.rpc');
    var QWeb = core.qweb;
    var _t = core._t;

    var CategoriesScreenWidget = screens.ScreenWidget.extend({
        template: 'CategoriesScreenWidget',

        start: function(){
            console.log("[CATEGORIES][start]")
            var self = this;

            this.product_list_widget = new ProductListWidget(this,{
                click_product_action: function(product){ self.click_product(product); },
                product_list: this.pos.db.get_product_by_category(0)
            });
            //this.product_list_widget.replace(this.$('.placeholder-ProductListWidget'));

            this.product_categories_widget = new ProductCategoriesWidget(this,{
                product_list_widget: this.product_list_widget,
            });
            this.product_categories_widget.replace(this.$('.placeholder-ProductCategoriesWidget'));

        },

        click_product: function(product) {
           if(product.to_weight && this.pos.config.iface_electronic_scale){
               this.gui.show_screen('scale',{product: product});
           }else{
               this.pos.get_order().add_product(product);
           }
        },

        show: function(){
            console.log("[CATEGORIES][show]");
            var self = this;
            var previous_screen = this.gui.get_current_screen_param('previous_screen');
            $('.button.previous-screen').click(function(){
                self.gui.show_screen(previous_screen);
            });
            this._super();
        },

    });

    gui.define_screen({
        name: 'wp-categories',
        widget: CategoriesScreenWidget
    });

    return {
        CategoriesScreenWidget: CategoriesScreenWidget,
    }
});
