/*
    Copyright 2019 Coop IT Easy SCRLfs
            Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('weighing_point.products', function (require) {
    "use strict";

    var screens = require('point_of_sale.screens');
    var PosBaseWidget = require('point_of_sale.BaseWidget');
    var DomCache = screens.DomCache;
    var core = require('web.core');
    var QWeb = core.qweb;

    var ProductsWidget = PosBaseWidget.extend({
        template:'ProductsWidget',

        init: function(parent, options) {
            var self = this;
            this._super(parent,options);
            this.model = options.model;
            this.productwidgets = [];
            this.weight = options.weight || 0;
            this.show_scale = options.show_scale || false;
            this.next_screen = options.next_screen || false;

            this.click_product_handler = function(){
                var product = self.pos.db.get_product_by_id(this.dataset.productId);
                options.click_product_action(product);
            };

            this.keypress_product_handler = function(ev){
                if (ev.which != 13 && ev.which != 32) {
                    // Key is not space or enter
                    return;
                }
                ev.preventDefault();
                var product = self.pos.db.get_product_by_id(this.dataset.productId);
                options.click_product_action(product);
            };

            this.product_list = options.product_list || [];
            this.product_cache = new DomCache();

            this.pos.get('orders').bind('add remove change', function () {
                self.renderElement();
            }, this);

            this.pos.bind('change:selectedOrder', function () {
                this.renderElement();
            }, this);
        },
        set_product_list: function(product_list){
            this.product_list = product_list;
            this.renderElement();
        },
        get_product_image_url: function(product){
            return window.location.origin + '/web/image?model=product.product&field=image_medium&id='+product.id;
        },
        replace: function($target){
            this.renderElement();
            var target = $target[0];
            target.parentNode.replaceChild(this.el,target);
        },
        calculate_cache_key: function(product, pricelist){
            return product.id + ',' + pricelist.id;
        },
        _get_active_pricelist: function(){
            var current_order = this.pos.get_order();
            var current_pricelist = this.pos.default_pricelist;

            if (current_order) {
                current_pricelist = current_order.pricelist;
            }

            return current_pricelist;
        },
        render_product: function(product){
            var current_pricelist = this._get_active_pricelist();
            var cache_key = this.calculate_cache_key(product, current_pricelist);
            var cached = this.product_cache.get_node(cache_key);
            if(!cached){
                var image_url = this.get_product_image_url(product);
                var product_html = QWeb.render('Product',{
                        widget:  this,
                        product: product,
                        pricelist: current_pricelist,
                        image_url: this.get_product_image_url(product),
                    });
                var product_node = document.createElement('div');
                product_node.innerHTML = product_html;
                product_node = product_node.childNodes[1];
                this.product_cache.cache_node(cache_key,product_node);
                return product_node;
            }
            return cached;
        },

        renderElement: function() {
            var el_str  = QWeb.render(this.template, {widget: this});
            var el_node = document.createElement('div');
                el_node.innerHTML = el_str;
                el_node = el_node.childNodes[1];

            if(this.el && this.el.parentNode){
                this.el.parentNode.replaceChild(el_node,this.el);
            }
            this.el = el_node;

            var list_container = el_node.querySelector('.product-list');
            for(var i = 0, len = this.product_list.length; i < len; i++){
                var product_node = this.render_product(this.product_list[i]);
                product_node.addEventListener('click',this.click_product_handler);
                product_node.addEventListener('keypress',this.keypress_product_handler);
                list_container.appendChild(product_node);
            }
        },

        show: function(){
            console.log('[PRODUCTS][show]');
            // TODO(Vincent) why this.$el - similar to the parent widget_base.js - fails?
            // hint: https://stackoverflow.com/questions/11512090/whats-the-difference-between-this-el-html-and-this-el-html
            // this.$el.addClass('oe_hidden');
            $(this.el).removeClass('oe_hidden');
        },
        hide: function(){
            console.log('[PRODUCTS][hide]');
            $(this.el).addClass('oe_hidden');
        },

    });

    return {
        ProductsWidget: ProductsWidget,
    };

});