odoo.define('weighing_point.screens', function (require) {
    "use strict";

    /**
     * This file contains the Screens definitions.
     *
     * This is a modified version of the point_of_sale.
     *
     * Screens are the content of the right pane of the pos, containing the main functionalities. // TODO(Vincent) WRONG
     * Screens must be defined and named in chrome.js before use.
     *
     * Screens transitions are controlled by the gui.
     * - gui.set_startup_screen() sets the screen displayed at startup
     * - gui.set_default_screen() sets the screen displayed for new orders //TODO(Vincent) still needed ?
     * - gui.show_screen() shows a screen
     * - gui.back() goes to the previous screen
     *
     * Screen state is saved in the order. When a new order is selected, //TODO(Vincent) change logic
     * a screen is displayed based on the state previously saved in the order.
     * this is also done in the Gui with:
     * - gui.show_saved_screen()
     *
     * All screens inherit from ScreenWidget.
     * The only addition from the base widgets are show() and hide() which shows and hides the screen
     * but are also used to bind and unbind actions on widgets and devices.
     * The gui guarantees that only one screen is shown at the same time
     * and that show() is called after all hide()s.
     *
     * Each Screens must be independent from each other
     * and should have no persistent state outside the models.
     * Screen state variables are reset at each screen display.
     * A screen can be called with parameters, which are to be used for the duration of the screen only.
     */
    var WpBaseWidget = require('weighing_point.BaseWidget');
    var gui = require('weighing_point.gui');
    var models = require('weighing_point.models');
    var core = require('web.core');
    var rpc = require('web.rpc');
    var utils = require('web.utils');
    var field_utils = require('web.field_utils');
    var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;

    var QWeb = core.qweb;
    var _t = core._t;

    var round_pr = utils.round_precision;

    /*--------------------------------------*\
     |          THE SCREEN WIDGET           |
    \*======================================*/

    /**
     * The screen widget is the base class inherited by all screens.
     */
    var ScreenWidget = WpBaseWidget.extend({

        init: function (parent, options) {
            this._super(parent, options);
            this.hidden = false;
        },

        //if defined, this screen will be loaded when a product is scanned
        //TODO(Vincent) define screen
        barcode_product_screen: 'products',

        // what happens when a product is scanned :
        // it will add the product to the order and go to barcode_product_screen.
        barcode_product_action: function (code) {
            var self = this;
            if (self.wp.scan_product(code)) {
                if (self.barcode_product_screen) {
                    self.gui.show_screen(self.barcode_product_screen, null, null, true);
                }
            } else {
                this.barcode_error_action(code);
            }
        },

        // what happens when a cashier id barcode is scanned.
        // the default behavior is the following :
        // - if there's a user with a matching barcode, put it as the active 'cashier', go to cashier mode, and return true
        // - else : do nothing and return false. You probably want to extend this to show and appropriate error popup...
        barcode_cashier_action: function (code) {
            var self = this;
            var users = this.wp.users;
            for (var i = 0, len = users.length; i < len; i++) {
                if (users[i].barcode === code.code) {
                    if (users[i].id !== this.wp.get_cashier().id && users[i].wp_security_pin) {
                        return this.gui.ask_password(users[i].wp_security_pin).then(function () {
                            self.wp.set_cashier(users[i]);
                            self.chrome.widget.username.renderElement();
                            return true;
                        });
                    } else {
                        this.wp.set_cashier(users[i]);
                        this.chrome.widget.username.renderElement();
                        return true;
                    }
                }
            }
            this.barcode_error_action(code);
            return false;
        },

        // what happens when a client id barcode is scanned.
        // the default behavior is the following :
        // - if there's a user with a matching barcode, put it as the active 'client' and return true
        // - else : return false.
        barcode_client_action: function (code) {
            var partner = this.wp.db.get_partner_by_barcode(code.code);
            if (partner) {
                this.wp.get_order().set_client(partner);
                return true;
            }
            this.barcode_error_action(code);
            return false;
        },

        // what happens when a discount barcode is scanned : the default behavior
        // is to set the discount on the last order.
        barcode_discount_action: function (code) {
            var last_orderline = this.wp.get_order().get_last_orderline();
            if (last_orderline) {
                last_orderline.set_discount(code.value);
            }
        },
        // What happens when an invalid barcode is scanned : shows an error popup.
        barcode_error_action: function (code) {
            var show_code;
            if (code.code.length > 32) {
                show_code = code.code.substring(0, 29) + '...';
            } else {
                show_code = code.code;
            }
            this.gui.show_popup('error-barcode', show_code);
        },

        // this method shows the screen and sets up all the widget related to this screen. Extend this method
        // if you want to alter the behavior of the screen.
        show: function () {
            console.log('[WP][SCREEN_WIDGET][show]');
            var self = this;

            this.hidden = false;
            if (this.$el) {
                this.$el.removeClass('oe_hidden');
            }

            this.wp.barcode_reader.set_action_callback({
                'cashier': _.bind(self.barcode_cashier_action, self),
                'product': _.bind(self.barcode_product_action, self),
                'weight': _.bind(self.barcode_product_action, self),
                'price': _.bind(self.barcode_product_action, self),
                'client': _.bind(self.barcode_client_action, self),
                'discount': _.bind(self.barcode_discount_action, self),
                'error': _.bind(self.barcode_error_action, self),
            });
        },

        // this method is called when the screen is closed to make place for a new screen. this is a good place
        // to put your cleanup stuff as it is guaranteed that for each show() there is one and only one close()
        close: function () {
            if (this.wp.barcode_reader) {
                this.wp.barcode_reader.reset_action_callbacks();
            }
        },

        // this methods hides the screen. It's not a good place to put your cleanup stuff as it is called on the
        // POS initialization.
        hide: function () {
            this.hidden = true;
            if (this.$el) {
                this.$el.addClass('oe_hidden');
            }
        },

        // we need this because some screens re-render themselves when they are hidden
        // (due to some events, or magic, or both...)  we must make sure they remain hidden.
        // the good solution would probably be to make them not re-render themselves when they
        // are hidden.
        renderElement: function () {
            this._super();
            if (this.hidden) {
                if (this.$el) {
                    this.$el.addClass('oe_hidden');
                }
            }
        },
    });

    /*--------------------------------------*\
     |          THE DOM CACHE               |
    \*======================================*/

    /**
     * The Dom Cache is used by various screens to improve
     * their performances when displaying many time the
     * same piece of DOM.
     *
     * It is a simple map from string 'keys' to DOM Nodes.
     *
     * The cache empties itself based on usage frequency
     * stats, so you may not always get back what
     * you put in.
     */
    var DomCache = core.Class.extend({
        init: function (options) {
            options = options || {};
            this.max_size = options.max_size || 2000;

            this.cache = {};
            this.access_time = {};
            this.size = 0;
        },
        cache_node: function (key, node) {
            var cached = this.cache[key];
            this.cache[key] = node;
            this.access_time[key] = new Date().getTime();
            if (!cached) {
                this.size++;
                while (this.size >= this.max_size) {
                    var oldest_key = null;
                    var oldest_time = new Date().getTime();
                    for (key in this.cache) {
                        var time = this.access_time[key];
                        if (time <= oldest_time) {
                            oldest_time = time;
                            oldest_key = key;
                        }
                    }
                    if (oldest_key) {
                        delete this.cache[oldest_key];
                        delete this.access_time[oldest_key];
                    }
                    this.size--;
                }
            }
            return node;
        },
        clear_node: function (key) {
            var cached = this.cache[key];
            if (cached) {
                delete this.cache[key];
                delete this.access_time[key];
                this.size--;
            }
        },
        get_node: function (key) {
            var cached = this.cache[key];
            if (cached) {
                this.access_time[key] = new Date().getTime();
            }
            return cached;
        },
    });

    /*--------------------------------------*\
     |          THE SCALE SCREEN            |
    \*======================================*/

    //TODO(Vincent) handles the scale screen as a scale widget
    /**
     * The scale screen displays the weight of a product
     * on the electronic scale
     */
    var ScaleScreenWidget = ScreenWidget.extend({
        template: 'ScaleScreenWidget',

        next_screen: 'products',
        previous_screen: 'products',

        show: function () {
            this._super();
            var self = this;
            var queue = this.wp.proxy_queue;

            this.set_weight(0);
            this.renderElement();

            this.hotkey_handler = function (event) {
                if (event.which === 13) {
                    self.order_product();
                    self.gui.show_screen(self.next_screen);
                } else if (event.which === 27) {
                    self.gui.show_screen(self.previous_screen);
                }
            };

            $('body').on('keypress', this.hotkey_handler);

            this.$('.back').click(function () {
                self.gui.show_screen(self.previous_screen);
            });

            this.$('.next,.buy-product').click(function () {
                self.gui.show_screen(self.next_screen);
                // add product *after* switching screen to scroll properly
                self.order_product();
            });

            queue.schedule(function () {
                return self.wp.proxy.scale_read().then(function (weight) {
                    self.set_weight(weight.weight);
                });
            }, {duration: 500, repeat: true});

        },
        get_product: function () {
            return this.gui.get_current_screen_param('product');
        },
        _get_active_pricelist: function () {
            var current_order = this.wp.get_order();
            var current_pricelist = this.wp.default_pricelist;

            if (current_order) {
                current_pricelist = current_order.pricelist;
            }

            return current_pricelist;
        },
        order_product: function () {
            this.wp.get_order().add_product(this.get_product(), {quantity: this.weight});
        },
        get_product_name: function () {
            var product = this.get_product();
            return (product ? product.display_name : undefined) || 'Unnamed Product';
        },
        get_product_price: function () {
            var product = this.get_product();
            var pricelist = this._get_active_pricelist();
            return (product ? product.get_price(pricelist, this.weight) : 0) || 0;
        },
        get_product_uom: function () {
            var product = this.get_product();

            if (product) {
                return this.wp.units_by_id[product.uom_id[0]].name;
            } else {
                return '';
            }
        },
        set_weight: function (weight) {
            this.weight = weight;
            this.$('.weight').text(this.get_product_weight_string());
            this.$('.computed-price').text(this.get_computed_price_string());
        },
        get_product_weight_string: function () {
            var product = this.get_product();
            var defaultstr = (this.weight || 0).toFixed(3) + ' Kg';
            if (!product || !this.wp) {
                return defaultstr;
            }
            var unit_id = product.uom_id;
            if (!unit_id) {
                return defaultstr;
            }
            var unit = this.wp.units_by_id[unit_id[0]];
            var weight = round_pr(this.weight || 0, unit.rounding);
            var weightstr = weight.toFixed(Math.ceil(Math.log(1.0 / unit.rounding) / Math.log(10)));
            weightstr += ' ' + unit.name;
            return weightstr;
        },
        get_computed_price_string: function () {
            return this.format_currency(this.get_product_price() * this.weight);
        },
        close: function () {
            this._super();
            $('body').off('keypress', this.hotkey_handler);

            this.wp.proxy_queue.clear();
        },
    });
    gui.define_screen({name: 'scale', widget: ScaleScreenWidget});

    /*--------------------------------------*\
     |         THE PRODUCT SCREEN           |
    \*======================================*/

    /*
    The product screen contains the list of products,
    the category selector and the order display.

    It is the default screen for orders //TODO(Vincent)
    and the startup screen for shops.

    There product screens uses many sub-widgets.
    The code follows.
    */

    /* ------ The Product Categories ------ */



    /**
     * Display and navigate the product categories.
     * Also handles searches.
     * - set_category() to change the displayed category
     * - reset_category() to go to the root category
     * - perform_search() to search for products
     * - clear_search()   does what it says.
     */
    var ProductCategoriesWidget = WpBaseWidget.extend({
        template: 'ProductCategoriesWidget',
        init: function (parent, options) {
            var self = this;
            this._super(parent, options);
            this.product_type = options.product_type || 'all';  // 'all' | 'weightable'
            this.onlyWeightable = options.onlyWeightable || false;
            this.category = this.wp.root_category;
            this.breadcrumb = [];
            this.subcategories = [];
            this.product_list_widget = options.product_list_widget || null;
            this.category_cache = new DomCache();
            this.start_categ_id = this.wp.config.iface_start_categ_id ? this.wp.config.iface_start_categ_id[0] : 0;
            this.set_category(this.wp.db.get_category_by_id(this.start_categ_id));

            this.switch_category_handler = function (event) {
                self.set_category(self.wp.db.get_category_by_id(Number(this.dataset.categoryId)));
                self.renderElement();
            };

            this.clear_search_handler = function (event) {
                self.clear_search();
            };

            var search_timeout = null;
            this.search_handler = function (event) {
                if (event.type == "keypress" || event.keyCode === 46 || event.keyCode === 8) {
                    clearTimeout(search_timeout);

                    var searchbox = this;

                    search_timeout = setTimeout(function () {
                        self.perform_search(self.category, searchbox.value, event.which === 13);
                    }, 70);
                }
            };
        },

        // changes the category. if undefined, sets to root category
        set_category: function (category) {
            var db = this.wp.db;
            if (!category) {
                this.category = db.get_category_by_id(db.root_category_id);
            } else {
                this.category = category;
            }
            this.breadcrumb = [];
            var ancestors_ids = db.get_category_ancestors_ids(this.category.id);
            for (var i = 1; i < ancestors_ids.length; i++) {
                this.breadcrumb.push(db.get_category_by_id(ancestors_ids[i]));
            }
            if (this.category.id !== db.root_category_id) {
                this.breadcrumb.push(this.category);
            }
            this.subcategories = db.get_category_by_id(db.get_category_childs_ids(this.category.id));
        },

        get_image_url: function (category) {
            return window.location.origin + '/web/image?model=wp.category&field=image_medium&id=' + category.id;
        },

        render_category: function (category, with_image) {
            var cached = this.category_cache.get_node(category.id);
            if (!cached) {
                if (with_image) {
                    var image_url = this.get_image_url(category);
                    var category_html = QWeb.render('CategoryButton', {
                        widget: this,
                        category: category,
                        image_url: this.get_image_url(category),
                    });
                    category_html = _.str.trim(category_html);
                    var category_node = document.createElement('div');
                    category_node.innerHTML = category_html;
                    category_node = category_node.childNodes[0];
                } else {
                    var category_html = QWeb.render('CategorySimpleButton', {
                        widget: this,
                        category: category,
                    });
                    category_html = _.str.trim(category_html);
                    var category_node = document.createElement('div');
                    category_node.innerHTML = category_html;
                    category_node = category_node.childNodes[0];
                }
                this.category_cache.cache_node(category.id, category_node);
                return category_node;
            }
            return cached;
        },

        replace: function ($target) {
            this.renderElement();
            var target = $target[0];
            target.parentNode.replaceChild(this.el, target);
        },

        renderElement: function () {

            var el_str = QWeb.render(this.template, {widget: this});
            var el_node = document.createElement('div');

            el_node.innerHTML = el_str;
            el_node = el_node.childNodes[1];

            if (this.el && this.el.parentNode) {
                this.el.parentNode.replaceChild(el_node, this.el);
            }

            this.el = el_node;

            var withpics = this.wp.config.iface_display_categ_images;

            var list_container = el_node.querySelector('.category-list');
            if (list_container) {
                if (!withpics) {
                    list_container.classList.add('simple');
                } else {
                    list_container.classList.remove('simple');
                }
                for (var i = 0, len = this.subcategories.length; i < len; i++) {
                    list_container.appendChild(this.render_category(this.subcategories[i], withpics));
                }
            }

            var buttons = el_node.querySelectorAll('.js-category-switch');
            for (var i = 0; i < buttons.length; i++) {
                buttons[i].addEventListener('click', this.switch_category_handler);
            }

            var products = this.wp.db.get_product_by_category(this.category.id);
            this.product_list_widget.set_product_list(products); // FIXME: this should be moved elsewhere ...

            this.el.querySelector('.searchbox input').addEventListener('keypress', this.search_handler);

            this.el.querySelector('.searchbox input').addEventListener('keydown', this.search_handler);

            this.el.querySelector('.search-clear').addEventListener('click', this.clear_search_handler);

            if (this.wp.config.iface_vkeyboard && this.chrome.widget.keyboard) {
                this.chrome.widget.keyboard.connect($(this.el.querySelector('.searchbox input')));
            }
        },

        // resets the current category to the root category
        reset_category: function () {
            this.set_category(this.wp.db.get_category_by_id(this.start_categ_id));
            this.renderElement();
        },

        // empties the content of the search box
        clear_search: function () {
            var products = this.wp.db.get_product_by_category(this.category.id);
            this.product_list_widget.set_product_list(products);
            var input = this.el.querySelector('.searchbox input');
            input.value = '';
            input.focus();
        },
        perform_search: function (category, query, buy_result) {
            var products;
            if (query) {
                products = this.wp.db.search_product_in_category(category.id, query);
                if (buy_result && products.length === 1) {
                    this.wp.get_order().add_product(products[0]);
                    this.clear_search();
                } else {
                    this.product_list_widget.set_product_list(products);
                }
            } else {
                products = this.wp.db.get_product_by_category(this.category.id);
                this.product_list_widget.set_product_list(products);
            }
        },

    });

    /* --------- The Product List --------- */
    /**
     * Display the list of products.
     * - change the list with .set_product_list()
     * - click_product_action(), passed as an option,
     *   tells what to do when a product is clicked.
     */
    var ProductListWidget = WpBaseWidget.extend({
        template: 'ProductListWidget',
        init: function (parent, options) {
            var self = this;
            this._super(parent, options);
            this.model = options.model;
            this.productwidgets = [];
            this.weight = options.weight || 0;
            this.show_scale = options.show_scale || false;
            this.next_screen = options.next_screen || false;

            this.click_product_handler = function () {
                var product = self.wp.db.get_product_by_id(this.dataset.productId);
                options.click_product_action(product);
            };

            this.keypress_product_handler = function (ev) {
                if (ev.which != 13 && ev.which != 32) {
                    // Key is not space or enter
                    return;
                }
                ev.preventDefault();
                var product = self.wp.db.get_product_by_id(this.dataset.productId);
                options.click_product_action(product);
            };

            this.product_list = options.product_list || [];
            this.product_cache = new DomCache();

            this.wp.get('orders').bind('add remove change', function () {
                self.renderElement();
            }, this);

            this.wp.bind('change:selectedOrder', function () {
                this.renderElement();
            }, this);
        },
        set_product_list: function (product_list) {
            this.product_list = product_list;
            this.renderElement();
        },
        get_product_image_url: function (product) {
            return window.location.origin + '/web/image?model=product.product&field=image_medium&id=' + product.id;
        },
        replace: function ($target) {
            this.renderElement();
            var target = $target[0];
            target.parentNode.replaceChild(this.el, target);
        },
        calculate_cache_key: function (product, pricelist) {
            return product.id + ',' + pricelist.id;
        },
        _get_active_pricelist: function () {
            var current_order = this.wp.get_order();
            var current_pricelist = this.wp.default_pricelist;

            if (current_order) {
                current_pricelist = current_order.pricelist;
            }

            return current_pricelist;
        },
        render_product: function (product) {
            var current_pricelist = this._get_active_pricelist();
            var cache_key = this.calculate_cache_key(product, current_pricelist);
            var cached = this.product_cache.get_node(cache_key);
            if (!cached) {
                var image_url = this.get_product_image_url(product);
                var product_html = QWeb.render('Product', {
                    widget: this,
                    product: product,
                    pricelist: current_pricelist,
                    image_url: this.get_product_image_url(product),
                });
                var product_node = document.createElement('div');
                product_node.innerHTML = product_html;
                product_node = product_node.childNodes[1];
                this.product_cache.cache_node(cache_key, product_node);
                return product_node;
            }
            return cached;
        },

        renderElement: function () {
            var el_str = QWeb.render(this.template, {widget: this});
            var el_node = document.createElement('div');
            el_node.innerHTML = el_str;
            el_node = el_node.childNodes[1];

            if (this.el && this.el.parentNode) {
                this.el.parentNode.replaceChild(el_node, this.el);
            }
            this.el = el_node;

            var list_container = el_node.querySelector('.product-list');
            for (var i = 0, len = this.product_list.length; i < len; i++) {
                var product_node = this.render_product(this.product_list[i]);
                product_node.addEventListener('click', this.click_product_handler);
                product_node.addEventListener('keypress', this.keypress_product_handler);
                list_container.appendChild(product_node);
            }
        },
    });

    /* -------- The Product Screen -------- */

    var ProductScreenWidget = ScreenWidget.extend({
        template: 'ProductScreenWidget',

        start: function () {

            var self = this;

            this.product_list_widget = new ProductListWidget(this, {
                click_product_action: function (product) {
                    self.click_product(product);
                },
                product_list: this.wp.db.get_product_by_category(0)
            });
            this.product_list_widget.replace(this.$('.placeholder-ProductListWidget'));

            this.product_categories_widget = new ProductCategoriesWidget(this, {
                product_list_widget: this.product_list_widget,
            });
            this.product_categories_widget.replace(this.$('.placeholder-ProductCategoriesWidget'));
        },

        click_product: function (product) {
            if (product.to_weight && this.wp.config.iface_electronic_scale) {
                this.gui.show_screen('scale', {product: product}); //TODO(Vincent) change logic
            } else {
                this.wp.get_order().add_product(product);
            }
        },

        show: function (reset) {
            this._super();
            if (reset) {
                this.product_categories_widget.reset_category();
            }
            if (this.wp.config.iface_vkeyboard && this.chrome.widget.keyboard) {
                this.chrome.widget.keyboard.connect($(this.el.querySelector('.searchbox input')));
            }
        },

        close: function () {
            this._super();
            if (this.wp.config.iface_vkeyboard && this.chrome.widget.keyboard) {
                this.chrome.widget.keyboard.hide();
            }
        },
    });
    gui.define_screen({name: 'products', widget: ProductScreenWidget});


    //TODO(Vincent) handle Label/Tag Screen
    /*--------------------------------------*\
     |         THE LABEL/TAG SCREEN           |
    \*======================================*/


    return {
        ScreenWidget: ScreenWidget,
        ProductScreenWidget: ProductScreenWidget,
        ProductListWidget: ProductListWidget,
        DomCache: DomCache,
        ProductCategoriesWidget: ProductCategoriesWidget,
        ScaleScreenWidget: ScaleScreenWidget,
    };

});
