odoo.define('weighing_point.models', function (require) {
    "use strict";

    var ajax = require('web.ajax');
    var BarcodeParser = require('barcodes.BarcodeParser');
    var WpDB = require('weighing_point.DB');
    var devices = require('weighing_point.devices');
    var concurrency = require('web.concurrency');
    var config = require('web.config');
    var core = require('web.core');
    var field_utils = require('web.field_utils');
    var rpc = require('web.rpc');
    var session = require('web.session');
    var time = require('web.time');
    var utils = require('web.utils');

    var QWeb = core.qweb;
    var _t = core._t;
    var Mutex = concurrency.Mutex;
    var round_di = utils.round_decimals;
    var round_pr = utils.round_precision;

    var exports = {};

    /**
     * The WpModel contains the Weighing Point's representation of the backend.
     *
     * This is a modified version of the point_of_sale.
     *
     * Since the Wp must work in standalone ( Without connection to the server )
     * it must contains a representation of the server's Wp backend
     * (taxes, product list, configuration options, etc.).
     *
     * This representation is fetched and stored by the WpModel at the initialisation.
     * This is done asynchronously, a ready deferred allows the GUI to wait interactively
     * for the loading to be completed
     *
     * There is a single instance of the WpModel for each Front-End instance, it is usually called
     * 'wp' and is available to all widgets extending WpBaseWidget.
     */
    exports.WpModel = Backbone.Model.extend({
        initialize: function (session, attributes) {
            Backbone.Model.prototype.initialize.call(this, attributes);
            var self = this;

            // used to make sure the orders are sent to the server once at time
            this.flush_mutex = new Mutex();
            this.chrome = attributes.chrome;
            this.gui = attributes.gui;

            // used to communicate to the hardware devices via a local proxy
            this.proxy = new devices.ProxyDevice(this);
            this.barcode_reader = new devices.BarcodeReader({'wp': this, proxy: this.proxy});

            // used to prevent parallels communications to the proxy
            this.proxy_queue = new devices.JobQueue();

            // a local database used to search trough products and categories & store pending orders
            this.db = new WpDB();
            this.debug = config.debug; //debug mode

            // Business data; loaded from the server at launch
            this.company_logo = null;
            this.company_logo_base64 = '';
            this.currency = null;
            this.shop = null;
            this.company = null;
            this.user = null;
            this.users = [];
            this.partners = [];
            this.cashregisters = [];
            this.taxes = [];
            this.wp_session = null;
            this.config = null;
            this.units = [];
            this.units_by_id = {};
            this.default_pricelist = null;
            this.order_sequence = 1;
            window.wpmodel = this;

            // these dynamic attributes can be watched for change by other models or widgets
            this.set({
                'synch': {state: 'connected', pending: 0},
                'orders': new OrderCollection(),
                'selectedOrder': null,
                'selectedClient': null,
                'cashier': null,
            });

            this.get('orders').bind('remove', function (order, _unused_, options) {
                self.on_removed_order(order, options.index, options.reason);
            });

            // Forward the 'client' attribute on the selected order to 'selectedClient'
            function update_client() {
                var order = self.get_order();
                this.set('selectedClient', order ? order.get_client() : null);
            }

            this.get('orders').bind('add remove change', update_client, this);
            this.bind('change:selectedOrder', update_client, this);

            // We fetch the backend data on the server asynchronously. this is done only when the pos user interface is launched,
            // Any change on this data made on the server is thus not reflected on the point of sale until it is relaunched.
            // when all the data has loaded, we compute some stuff, and declare the Pos ready to be used.
            this.ready = this.load_server_data().then(function () {
                return self.after_load_server_data();
            });
        },
        after_load_server_data: function () {
            this.load_orders();
            this.set_start_order();
            if (this.config.use_proxy) {
                if (this.config.iface_customer_facing_display) {
                    this.on('change:selectedOrder', this.send_current_order_to_customer_facing_display, this);
                }

                return this.connect_to_proxy();
            }
        },
        // releases ressources holds by the model at the end of life of the posmodel
        destroy: function () {
            // FIXME, should wait for flushing, return a deferred to indicate successfull destruction
            // this.flush();
            this.proxy.close();
            this.barcode_reader.disconnect();
            this.barcode_reader.disconnect_from_proxy();
        },

        connect_to_proxy: function () {
            var self = this;
            var done = new $.Deferred();
            this.barcode_reader.disconnect_from_proxy();
            this.chrome.loading_message(_t('Connecting to the IoT Box'), 0);
            this.chrome.loading_skip(function () {
                self.proxy.stop_searching();
            });
            this.proxy.autoconnect({
                force_ip: self.config.proxy_ip || undefined,
                progress: function (prog) {
                    self.chrome.loading_progress(prog);
                },
            }).then(
                function () {
                    if (self.config.iface_scan_via_proxy) {
                        self.barcode_reader.connect_to_proxy();
                    }
                    done.resolve();
                },
                function (statusText, url) {
                    if (statusText == 'error' && window.location.protocol == 'https:') {
                        var error = {message: 'TLSError', url: url};
                        self.chrome.loading_error(error);
                    } else {
                        done.resolve();
                    }
                });
            return done;
        },

        // Server side model loaders. This is the list of the models that need to be loaded from
        // the server. The models are loaded one by one by this list's order. The 'loaded' callback
        // is used to store the data in the appropriate place once it has been loaded. This callback
        // can return a deferred that will pause the loading of the next module.
        // a shared temporary dictionary is available for loaders to communicate private variables
        // used during loading such as object ids, etc.
        models: [
            {
                label: 'version',
                loaded: function (self) {
                    return session.rpc('/web/webclient/version_info', {}).done(function (version) {
                        self.version = version;
                    });
                },

            }, {
                model: 'res.users',
                fields: ['name', 'company_id'],
                ids: function (self) {
                    return [session.uid];
                },
                loaded: function (self, users) {
                    self.user = users[0];
                },
            }, {
                model: 'res.company',
                fields: ['currency_id', 'email', 'website', 'company_registry', 'vat', 'name', 'phone', 'partner_id', 'country_id', 'tax_calculation_rounding_method'],
                ids: function (self) {
                    return [self.user.company_id[0]];
                },
                loaded: function (self, companies) {
                    self.company = companies[0];
                },
            }, {
                model: 'decimal.precision',
                fields: ['name', 'digits'],
                loaded: function (self, dps) {
                    self.dp = {};
                    for (var i = 0; i < dps.length; i++) {
                        self.dp[dps[i].name] = dps[i].digits;
                    }
                },
            }, {
                model: 'uom.uom',
                fields: [],
                domain: null,
                context: function (self) {
                    return {active_test: false};
                },
                loaded: function (self, units) {
                    self.units = units;
                    _.each(units, function (unit) {
                        self.units_by_id[unit.id] = unit;
                    });
                }
            }, {
                model: 'res.partner',
                fields: ['name', 'street', 'city', 'state_id', 'country_id', 'vat',
                    'phone', 'zip', 'mobile', 'email', 'barcode', 'write_date',
                    'property_account_position_id', 'property_product_pricelist'],
                domain: [['customer', '=', true]],
                loaded: function (self, partners) {
                    self.partners = partners;
                    self.db.add_partners(partners);
                },
            }, {
                model: 'res.country',
                fields: ['name', 'vat_label'],
                loaded: function (self, countries) {
                    self.countries = countries;
                    self.company.country = null;
                    for (var i = 0; i < countries.length; i++) {
                        if (countries[i].id === self.company.country_id[0]) {
                            self.company.country = countries[i];
                        }
                    }
                },
            }, {
                model: 'account.tax',
                fields: ['name', 'amount', 'price_include', 'include_base_amount', 'amount_type', 'children_tax_ids'],
                domain: function (self) {
                    return [['company_id', '=', self.company && self.company.id || false]]
                },
                loaded: function (self, taxes) {
                    self.taxes = taxes;
                    self.taxes_by_id = {};
                    _.each(taxes, function (tax) {
                        self.taxes_by_id[tax.id] = tax;
                    });
                    _.each(self.taxes_by_id, function (tax) {
                        tax.children_tax_ids = _.map(tax.children_tax_ids, function (child_tax_id) {
                            return self.taxes_by_id[child_tax_id];
                        });
                    });
                },
            }, {
                model: 'wp.session',
                fields: ['id', 'journal_ids', 'name', 'user_id', 'config_id', 'start_at', 'stop_at', 'sequence_number', 'login_number'],
                domain: function (self) {
                    return [['state', '=', 'opened'], ['user_id', '=', session.uid]];
                },
                loaded: function (self, wp_sessions) {
                    self.wp_session = wp_sessions[0];
                },
            }, {
                model: 'wp.config',
                fields: [],
                domain: function (self) {
                    return [['id', '=', self.wp_session.config_id[0]]];
                },
                loaded: function (self, configs) {
                    self.config = configs[0];
                    self.config.use_proxy = self.config.iface_payment_terminal ||
                        self.config.iface_electronic_scale ||
                        self.config.iface_print_via_proxy ||
                        self.config.iface_scan_via_proxy ||
                        self.config.iface_cashdrawer ||
                        self.config.iface_customer_facing_display;

                    if (self.config.company_id[0] !== self.user.company_id[0]) {
                        throw new Error(_t("Error: The Point of Sale User must belong to the same company as the Point of Sale. You are probably trying to load the point of sale as an administrator in a multi-company setup, with the administrator account set to the wrong company."));
                    }

                    self.db.set_uuid(self.config.uuid);
                    self.set_cashier(self.get_cashier());
                    // We need to do it here, since only then the local storage has the correct uuid
                    self.db.save('wp_session_id', self.wp_session.id);

                    var orders = self.db.get_orders();
                    for (var i = 0; i < orders.length; i++) {
                        self.wp_session.sequence_number = Math.max(self.wp_session.sequence_number, orders[i].data.sequence_number + 1);
                    }
                },
            }, {
                model: 'res.users',
                fields: ['name', 'wp_security_pin', 'groups_id', 'barcode'],
                domain: function (self) {
                    return [['company_id', '=', self.user.company_id[0]], '|', ['groups_id', '=', self.config.group_wp_manager_id[0]], ['groups_id', '=', self.config.group_wp_user_id[0]]];
                },
                loaded: function (self, users) {
                    // we attribute a role to the user, 'cashier' or 'manager', depending
                    // on the group the user belongs.
                    var wp_users = [];
                    var current_cashier = self.get_cashier();
                    for (var i = 0; i < users.length; i++) {
                        var user = users[i];
                        for (var j = 0; j < user.groups_id.length; j++) {
                            var group_id = user.groups_id[j];
                            if (group_id === self.config.group_wp_manager_id[0]) {
                                user.role = 'manager';
                                break;
                            } else if (group_id === self.config.group_wp_user_id[0]) {
                                user.role = 'cashier';
                            }
                        }
                        if (user.role) {
                            wp_users.push(user);
                        }
                        // replace the current user with its updated version
                        if (user.id === self.user.id) {
                            self.user = user;
                        }
                        if (user.id === current_cashier.id) {
                            self.set_cashier(user);
                        }
                    }
                    self.users = wp_users;
                },
            }, {
                model: 'stock.location',
                fields: [],
                ids: function (self) {
                    return [self.config.stock_location_id[0]];
                },
                loaded: function (self, locations) {
                    self.shop = locations[0];
                },
            }, {
                model: 'product.pricelist',
                fields: ['name', 'display_name'],
                domain: function (self) {
                    return [['id', 'in', self.config.available_pricelist_ids]];
                },
                loaded: function (self, pricelists) {
                    _.map(pricelists, function (pricelist) {
                        pricelist.items = [];
                    });
                    self.default_pricelist = _.findWhere(pricelists, {id: self.config.pricelist_id[0]});
                    self.pricelists = pricelists;
                },
            }, {
                model: 'product.pricelist.item',
                domain: function (self) {
                    return [['pricelist_id', 'in', _.pluck(self.pricelists, 'id')]];
                },
                loaded: function (self, pricelist_items) {
                    var pricelist_by_id = {};
                    _.each(self.pricelists, function (pricelist) {
                        pricelist_by_id[pricelist.id] = pricelist;
                    });

                    _.each(pricelist_items, function (item) {
                        var pricelist = pricelist_by_id[item.pricelist_id[0]];
                        pricelist.items.push(item);
                        item.base_pricelist = pricelist_by_id[item.base_pricelist_id[0]];
                    });
                },
            }, {
                model: 'product.category',
                fields: ['name', 'parent_id'],
                loaded: function (self, product_categories) {
                    var category_by_id = {};
                    _.each(product_categories, function (category) {
                        category_by_id[category.id] = category;
                    });
                    _.each(product_categories, function (category) {
                        category.parent = category_by_id[category.parent_id[0]];
                    });

                    self.product_categories = product_categories;
                },
            }, {
                model: 'res.currency',
                fields: ['name', 'symbol', 'position', 'rounding', 'rate'],
                ids: function (self) {
                    return [self.config.currency_id[0], self.company.currency_id[0]];
                },
                loaded: function (self, currencies) {
                    self.currency = currencies[0];
                    if (self.currency.rounding > 0 && self.currency.rounding < 1) {
                        self.currency.decimals = Math.ceil(Math.log(1.0 / self.currency.rounding) / Math.log(10));
                    } else {
                        self.currency.decimals = 0;
                    }

                    self.company_currency = currencies[1];
                },
            }, {
                model: 'wp.category',
                fields: ['id', 'name', 'parent_id', 'child_id'],
                domain: null,
                loaded: function (self, categories) {
                    self.db.add_categories(categories);
                },
            }, {
                model: 'product.product',
                // todo remove list_price in master, it is unused
                fields: ['display_name', 'list_price', 'lst_price', 'standard_price', 'categ_id', 'wp_categ_id', 'taxes_id',
                    'barcode', 'default_code', 'to_weight', 'uom_id', 'description_sale', 'description',
                    'product_tmpl_id', 'tracking'],
                order: _.map(['sequence', 'default_code', 'name'], function (name) {
                    return {name: name};
                }),
                domain: [['sale_ok', '=', true], ['available_in_wp', '=', true]],
                context: function (self) {
                    return {display_default_code: false};
                },
                loaded: function (self, products) {
                    var using_company_currency = self.config.currency_id[0] === self.company.currency_id[0];
                    var conversion_rate = self.currency.rate / self.company_currency.rate;
                    self.db.add_products(_.map(products, function (product) {
                        if (!using_company_currency) {
                            product.lst_price = round_pr(product.lst_price * conversion_rate, self.currency.rounding);
                        }
                        product.categ = _.findWhere(self.product_categories, {'id': product.categ_id[0]});
                        return new exports.Product({}, product);
                    }));
                },
            }, {
                model: 'account.bank.statement',
                fields: ['account_id', 'currency_id', 'journal_id', 'state', 'name', 'user_id', 'wp_session_id'],
                domain: function (self) {
                    return [['state', '=', 'open'], ['wp_session_id', '=', self.wp_session.id]];
                },
                loaded: function (self, cashregisters, tmp) {
                    self.cashregisters = cashregisters;

                    tmp.journals = [];
                    _.each(cashregisters, function (statement) {
                        tmp.journals.push(statement.journal_id[0]);
                    });
                },
            }, {
                model: 'account.journal',
                fields: ['type', 'sequence'],
                domain: function (self, tmp) {
                    return [['id', 'in', tmp.journals]];
                },
                loaded: function (self, journals) {
                    var i;
                    self.journals = journals;

                    // associate the bank statements with their journals.
                    var cashregisters = self.cashregisters;
                    var ilen = cashregisters.length;
                    for (i = 0; i < ilen; i++) {
                        for (var j = 0, jlen = journals.length; j < jlen; j++) {
                            if (cashregisters[i].journal_id[0] === journals[j].id) {
                                cashregisters[i].journal = journals[j];
                            }
                        }
                    }

                    self.cashregisters_by_id = {};
                    for (i = 0; i < self.cashregisters.length; i++) {
                        self.cashregisters_by_id[self.cashregisters[i].id] = self.cashregisters[i];
                    }

                    self.cashregisters = self.cashregisters.sort(function (a, b) {
                        // prefer cashregisters to be first in the list
                        if (a.journal.type == "cash" && b.journal.type != "cash") {
                            return -1;
                        } else if (a.journal.type != "cash" && b.journal.type == "cash") {
                            return 1;
                        } else {
                            return a.journal.sequence - b.journal.sequence;
                        }
                    });

                },
            }, {
                model: 'account.fiscal.position',
                fields: [],
                domain: function (self) {
                    return [['id', 'in', self.config.fiscal_position_ids]];
                },
                loaded: function (self, fiscal_positions) {
                    self.fiscal_positions = fiscal_positions;
                }
            }, {
                model: 'account.fiscal.position.tax',
                fields: [],
                domain: function (self) {
                    var fiscal_position_tax_ids = [];

                    self.fiscal_positions.forEach(function (fiscal_position) {
                        fiscal_position.tax_ids.forEach(function (tax_id) {
                            fiscal_position_tax_ids.push(tax_id);
                        });
                    });

                    return [['id', 'in', fiscal_position_tax_ids]];
                },
                loaded: function (self, fiscal_position_taxes) {
                    self.fiscal_position_taxes = fiscal_position_taxes;
                    self.fiscal_positions.forEach(function (fiscal_position) {
                        fiscal_position.fiscal_position_taxes_by_id = {};
                        fiscal_position.tax_ids.forEach(function (tax_id) {
                            var fiscal_position_tax = _.find(fiscal_position_taxes, function (fiscal_position_tax) {
                                return fiscal_position_tax.id === tax_id;
                            });

                            fiscal_position.fiscal_position_taxes_by_id[fiscal_position_tax.id] = fiscal_position_tax;
                        });
                    });
                }
            }, {
                label: 'fonts',
                loaded: function () {
                    var fonts_loaded = new $.Deferred();
                    // Waiting for fonts to be loaded to prevent receipt printing
                    // from printing empty receipt while loading Inconsolata
                    // ( The font used for the receipt )
                    waitForWebfonts(['Lato', 'Inconsolata'], function () {
                        fonts_loaded.resolve();
                    });
                    // The JS used to detect font loading is not 100% robust, so
                    // do not wait more than 5sec
                    setTimeout(function () {
                        fonts_loaded.resolve();
                    }, 5000);

                    return fonts_loaded;
                },
            }, {
                label: 'pictures',
                loaded: function (self) {
                    self.company_logo = new Image();
                    var logo_loaded = new $.Deferred();
                    self.company_logo.onload = function () {
                        var img = self.company_logo;
                        var ratio = 1;
                        var targetwidth = 300;
                        var maxheight = 150;
                        if (img.width !== targetwidth) {
                            ratio = targetwidth / img.width;
                        }
                        if (img.height * ratio > maxheight) {
                            ratio = maxheight / img.height;
                        }
                        var width = Math.floor(img.width * ratio);
                        var height = Math.floor(img.height * ratio);
                        var c = document.createElement('canvas');
                        c.width = width;
                        c.height = height;
                        var ctx = c.getContext('2d');
                        ctx.drawImage(self.company_logo, 0, 0, width, height);

                        self.company_logo_base64 = c.toDataURL();
                        logo_loaded.resolve();
                    };
                    self.company_logo.onerror = function () {
                        logo_loaded.reject();
                    };
                    self.company_logo.crossOrigin = "anonymous";
                    self.company_logo.src = '/web/binary/company_logo' + '?dbname=' + session.db + '&_' + Math.random();

                    return logo_loaded;
                },
            }, {
                label: 'barcodes',
                loaded: function (self) {
                    var barcode_parser = new BarcodeParser({'nomenclature_id': self.config.barcode_nomenclature_id});
                    self.barcode_reader.set_barcode_parser(barcode_parser);
                    return barcode_parser.is_loaded();
                },
            }
        ],

        // loads all the needed data on the sever. returns a deferred indicating when all the data has loaded.
        load_server_data: function () {
            var self = this;
            var loaded = new $.Deferred();
            var progress = 0;
            var progress_step = 1.0 / self.models.length;
            var tmp = {}; // this is used to share a temporary state between models loaders

            function load_model(index) {
                if (index >= self.models.length) {
                    loaded.resolve();
                } else {
                    var model = self.models[index];
                    self.chrome.loading_message(_t('Loading') + ' ' + (model.label || model.model || ''), progress);

                    var cond = typeof model.condition === 'function' ? model.condition(self, tmp) : true;
                    if (!cond) {
                        load_model(index + 1);
                        return;
                    }

                    var fields = typeof model.fields === 'function' ? model.fields(self, tmp) : model.fields;
                    var domain = typeof model.domain === 'function' ? model.domain(self, tmp) : model.domain;
                    var context = typeof model.context === 'function' ? model.context(self, tmp) : model.context || {};
                    var ids = typeof model.ids === 'function' ? model.ids(self, tmp) : model.ids;
                    var order = typeof model.order === 'function' ? model.order(self, tmp) : model.order;
                    progress += progress_step;

                    if (model.model) {
                        var params = {
                            model: model.model,
                            context: _.extend(context, session.user_context || {}),
                        };

                        if (model.ids) {
                            params.method = 'read';
                            params.args = [ids, fields];
                        } else {
                            params.method = 'search_read';
                            params.domain = domain;
                            params.fields = fields;
                            params.orderBy = order;
                        }

                        rpc.query(params).then(function (result) {
                            try {    // catching exceptions in model.loaded(...)
                                $.when(model.loaded(self, result, tmp))
                                    .then(function () {
                                            load_model(index + 1);
                                        },
                                        function (err) {
                                            loaded.reject(err);
                                        });
                            } catch (err) {
                                console.error(err.message, err.stack);
                                loaded.reject(err);
                            }
                        }, function (err) {
                            loaded.reject(err);
                        });
                    } else if (model.loaded) {
                        try {    // catching exceptions in model.loaded(...)
                            $.when(model.loaded(self, tmp))
                                .then(function () {
                                        load_model(index + 1);
                                    },
                                    function (err) {
                                        loaded.reject(err);
                                    });
                        } catch (err) {
                            loaded.reject(err);
                        }
                    } else {
                        load_model(index + 1);
                    }
                }
            }

            try {
                load_model(0);
            } catch (err) {
                loaded.reject(err);
            }

            return loaded;
        },

        // reload the list of partner, returns as a deferred that resolves if there were
        // updated partners, and fails if not
        load_new_partners: function () {
            var self = this;
            var def = new $.Deferred();
            var fields = _.find(this.models, function (model) {
                return model.model === 'res.partner';
            }).fields;
            var domain = [['customer', '=', true], ['write_date', '>', this.db.get_partner_write_date()]];
            rpc.query({
                model: 'res.partner',
                method: 'search_read',
                args: [domain, fields],
            }, {
                timeout: 3000,
                shadow: true,
            })
                .then(function (partners) {
                    if (self.db.add_partners(partners)) {   // check if the partners we got were real updates
                        def.resolve();
                    } else {
                        def.reject();
                    }
                }, function (type, err) {
                    def.reject();
                });
            return def;
        },

        // this is called when an order is removed from the order collection. It ensures that there is always an existing
        // order and a valid selected order
        on_removed_order: function (removed_order, index, reason) {
            var order_list = this.get_order_list();
            if ((reason === 'abandon' || removed_order.temporary) && order_list.length > 0) {
                // when we intentionally remove an unfinished order, and there is another existing one
                this.set_order(order_list[index] || order_list[order_list.length - 1]);
            } else {
                // when the order was automatically removed after completion,
                // or when we intentionally delete the only concurrent order
                this.add_new_order();
            }
        },

        // returns the user who is currently the cashier for this point of sale
        get_cashier: function () {
            // reset the cashier to the current user if session is new
            if (this.db.load('wp_session_id') !== this.wp_session.id) {
                this.set_cashier(this.user);
            }
            return this.db.get_cashier() || this.get('cashier') || this.user;
        },
        // changes the current cashier
        set_cashier: function (user) {
            this.set('cashier', user);
            this.db.set_cashier(this.get('cashier'));
        },
        //creates a new empty order and sets it as the current order
        add_new_order: function () {
            var order = new exports.Order({}, {wp: this});
            this.get('orders').add(order);
            this.set('selectedOrder', order);
            return order;
        },
        // load the locally saved unpaid orders for this session.
        load_orders: function () {
            var jsons = this.db.get_unpaid_orders();
            var orders = [];
            var not_loaded_count = 0;

            for (var i = 0; i < jsons.length; i++) {
                var json = jsons[i];
                if (json.wp_session_id === this.wp_session.id) {
                    orders.push(new exports.Order({}, {
                        wp: this,
                        json: json,
                    }));
                } else {
                    not_loaded_count += 1;
                }
            }

            if (not_loaded_count) {
                console.info('There are ' + not_loaded_count + ' locally saved unpaid orders belonging to another session');
            }

            orders = orders.sort(function (a, b) {
                return a.sequence_number - b.sequence_number;
            });

            if (orders.length) {
                this.get('orders').add(orders);
            }
        },

        set_start_order: function () {
            var orders = this.get('orders').models;

            if (orders.length && !this.get('selectedOrder')) {
                this.set('selectedOrder', orders[0]);
            } else {
                this.add_new_order();
            }
        },

        // return the current order
        get_order: function () {
            return this.get('selectedOrder');
        },

        get_client: function () {
            var order = this.get_order();
            if (order) {
                return order.get_client();
            }
            return null;
        },

        // change the current order
        set_order: function (order) {
            this.set({selectedOrder: order});
        },

        // return the list of unpaid orders
        get_order_list: function () {
            return this.get('orders').models;
        },

        //removes the current order
        delete_current_order: function () {
            var order = this.get_order();
            if (order) {
                order.destroy({'reason': 'abandon'});
            }
        },

        _convert_product_img_to_base64: function (product, url) {
            var deferred = new $.Deferred();
            var img = new Image();

            img.onload = function () {
                var canvas = document.createElement('CANVAS');
                var ctx = canvas.getContext('2d');

                canvas.height = this.height;
                canvas.width = this.width;
                ctx.drawImage(this, 0, 0);

                var dataURL = canvas.toDataURL('image/jpeg');
                product.image_base64 = dataURL;
                canvas = null;

                deferred.resolve();
            };
            img.crossOrigin = 'use-credentials';
            img.src = url;

            return deferred;
        },

        send_current_order_to_customer_facing_display: function () {
            var self = this;
            this.render_html_for_customer_facing_display().then(function (rendered_html) {
                self.proxy.update_customer_facing_display(rendered_html);
            });
        },

        render_html_for_customer_facing_display: function () {
            var self = this;
            var order = this.get_order();
            var rendered_html = this.config.customer_facing_display_html;

            // If we're using an external device like the IoT Box, we
            // cannot get /web/image?model=product.product because the
            // IoT Box is not logged in and thus doesn't have the access
            // rights to access product.product. So instead we'll base64
            // encode it and embed it in the HTML.
            var get_image_deferreds = [];

            if (order) {
                order.get_orderlines().forEach(function (orderline) {
                    var product = orderline.product;
                    var image_url = window.location.origin + '/web/image?model=product.product&field=image_medium&id=' + product.id;

                    // only download and convert image if we haven't done it before
                    if (!product.image_base64) {
                        get_image_deferreds.push(self._convert_product_img_to_base64(product, image_url));
                    }
                });
            }

            // when all images are loaded in product.image_base64
            return $.when.apply($, get_image_deferreds).then(function () {
                var rendered_order_lines = "";
                var rendered_payment_lines = "";
                var order_total_with_tax = self.chrome.format_currency(0);

                if (order) {
                    rendered_order_lines = QWeb.render('CustomerFacingDisplayOrderLines', {
                        'orderlines': order.get_orderlines(),
                        'widget': self.chrome,
                    });
                    rendered_payment_lines = QWeb.render('CustomerFacingDisplayPaymentLines', {
                        'order': order,
                        'widget': self.chrome,
                    });
                    order_total_with_tax = self.chrome.format_currency(order.get_total_with_tax());
                }

                var $rendered_html = $(rendered_html);
                $rendered_html.find('.wp_orderlines_list').html(rendered_order_lines);
                $rendered_html.find('.wp-total').find('.wp_total-amount').html(order_total_with_tax);
                var wp_change_title = $rendered_html.find('.wp-change_title').text();
                $rendered_html.find('.wp-paymentlines').html(rendered_payment_lines);
                $rendered_html.find('.wp-change_title').text(wp_change_title);

                // prop only uses the first element in a set of elements,
                // and there's no guarantee that
                // customer_facing_display_html is wrapped in a single
                // root element.
                rendered_html = _.reduce($rendered_html, function (memory, current_element) {
                    return memory + $(current_element).prop('outerHTML');
                }, ""); // initial memory of ""

                rendered_html = QWeb.render('CustomerFacingDisplayHead', {
                    origin: window.location.origin
                }) + rendered_html;
                return rendered_html;
            });
        },

        // saves the order locally and try to send it to the backend.
        // it returns a deferred that succeeds after having tried to send the order and all the other pending orders.
        push_order: function (order, opts) {
            opts = opts || {};
            var self = this;

            if (order) {
                this.db.add_order(order.export_as_JSON());
            }

            var pushed = new $.Deferred();

            this.flush_mutex.exec(function () {
                var flushed = self._flush_orders(self.db.get_orders(), opts);

                flushed.always(function (ids) {
                    pushed.resolve();
                });

                return flushed;
            });
            return pushed;
        },

        // saves the order locally and try to send it to the backend and make an invoice
        // returns a deferred that succeeds when the order has been posted and successfully generated
        // an invoice. This method can fail in various ways:
        // error-no-client: the order must have an associated partner_id. You can retry to make an invoice once
        //     this error is solved
        // error-transfer: there was a connection error during the transfer. You can retry to make the invoice once
        //     the network connection is up

        push_and_invoice_order: function (order) {
            var self = this;
            var invoiced = new $.Deferred();

            if (!order.get_client()) {
                invoiced.reject({code: 400, message: 'Missing Customer', data: {}});
                return invoiced;
            }

            var order_id = this.db.add_order(order.export_as_JSON());

            this.flush_mutex.exec(function () {
                var done = new $.Deferred(); // holds the mutex

                // send the order to the server
                // we have a 30 seconds timeout on this push.
                // FIXME: if the server takes more than 30 seconds to accept the order,
                // the client will believe it wasn't successfully sent, and very bad
                // things will happen as a duplicate will be sent next time
                // so we must make sure the server detects and ignores duplicated orders

                var transfer = self._flush_orders([self.db.get_order(order_id)], {timeout: 30000, to_invoice: true});

                transfer.fail(function (error) {
                    invoiced.reject(error);
                    done.reject();
                });

                // on success, get the order id generated by the server
                transfer.pipe(function (order_server_id) {

                    // generate the pdf and download it
                    if (order_server_id.length) {
                        self.chrome.do_action('point_of_sale.wp_invoice_report', {
                            additional_context: {
                                active_ids: order_server_id,
                            }
                        }).done(function () {
                            invoiced.resolve();
                            done.resolve();
                        });
                    } else {
                        // The order has been pushed separately in batch when
                        // the connection came back.
                        // The user has to go to the backend to print the invoice
                        invoiced.reject({code: 401, message: 'Backend Invoice', data: {order: order}});
                        done.reject();
                    }
                });

                return done;

            });

            return invoiced;
        },

        // wrapper around the _save_to_server that updates the synch status widget
        _flush_orders: function (orders, options) {
            var self = this;
            this.set('synch', {state: 'connecting', pending: orders.length});

            return self._save_to_server(orders, options).done(function (server_ids) {
                var pending = self.db.get_orders().length;

                self.set('synch', {
                    state: pending ? 'connecting' : 'connected',
                    pending: pending
                });

                return server_ids;
            }).fail(function (error, event) {
                var pending = self.db.get_orders().length;
                if (self.get('failed')) {
                    self.set('synch', {state: 'error', pending: pending});
                } else {
                    self.set('synch', {state: 'disconnected', pending: pending});
                }
            });
        },

        // send an array of orders to the server
        // available options:
        // - timeout: timeout for the rpc call in ms
        // returns a deferred that resolves with the list of
        // server generated ids for the sent orders
        _save_to_server: function (orders, options) {
            if (!orders || !orders.length) {
                var result = $.Deferred();
                result.resolve([]);
                return result;
            }

            options = options || {};

            var self = this;
            var timeout = typeof options.timeout === 'number' ? options.timeout : 7500 * orders.length;

            // Keep the order ids that are about to be sent to the
            // backend. In between create_from_ui and the success callback
            // new orders may have been added to it.
            var order_ids_to_sync = _.pluck(orders, 'id');

            // we try to send the order. shadow prevents a spinner if it takes too long. (unless we are sending an invoice,
            // then we want to notify the user that we are waiting on something )
            var args = [_.map(orders, function (order) {
                order.to_invoice = options.to_invoice || false;
                return order;
            })];
            return rpc.query({
                model: 'wp.order',
                method: 'create_from_ui',
                args: args,
                kwargs: {context: session.user_context},
            }, {
                timeout: timeout,
                shadow: !options.to_invoice
            })
                .then(function (server_ids) {
                    _.each(order_ids_to_sync, function (order_id) {
                        self.db.remove_order(order_id);
                    });
                    self.set('failed', false);
                    return server_ids;
                }).fail(function (type, error) {
                    if (error.code === 200) {    // Business Logic Error, not a connection problem
                        //if warning do not need to display traceback!!
                        if (error.data.exception_type == 'warning') {
                            delete error.data.debug;
                        }

                        // Hide error if already shown before ...
                        if ((!self.get('failed') || options.show_error) && !options.to_invoice) {
                            self.gui.show_popup('error-traceback', {
                                'title': error.data.message,
                                'body': error.data.debug
                            });
                        }
                        self.set('failed', error);
                    }
                    console.error('Failed to send orders:', orders);
                });
        },

        scan_product: function (parsed_code) {
            var selectedOrder = this.get_order();
            var product = this.db.get_product_by_barcode(parsed_code.base_code);

            if (!product) {
                return false;
            }

            if (parsed_code.type === 'price') {
                selectedOrder.add_product(product, {price: parsed_code.value});
            } else if (parsed_code.type === 'weight') {
                selectedOrder.add_product(product, {quantity: parsed_code.value, merge: false});
            } else if (parsed_code.type === 'discount') {
                selectedOrder.add_product(product, {discount: parsed_code.value, merge: false});
            } else {
                selectedOrder.add_product(product);
            }
            return true;
        },

        // Exports the paid orders (the ones waiting for internet connection)
        export_paid_orders: function () {
            return JSON.stringify({
                'paid_orders': this.db.get_orders(),
                'session': this.wp_session.name,
                'session_id': this.wp_session.id,
                'date': (new Date()).toUTCString(),
                'version': this.version.server_version_info,
            }, null, 2);
        },

        // Exports the unpaid orders (the tabs)
        export_unpaid_orders: function () {
            return JSON.stringify({
                'unpaid_orders': this.db.get_unpaid_orders(),
                'session': this.wp_session.name,
                'session_id': this.wp_session.id,
                'date': (new Date()).toUTCString(),
                'version': this.version.server_version_info,
            }, null, 2);
        },

        // This imports paid or unpaid orders from a json file whose
        // contents are provided as the string str.
        // It returns a report of what could and what could not be
        // imported.
        import_orders: function (str) {
            var json = JSON.parse(str);
            var report = {
                // Number of paid orders that were imported
                paid: 0,
                // Number of unpaid orders that were imported
                unpaid: 0,
                // Orders that were not imported because they already exist (uid conflict)
                unpaid_skipped_existing: 0,
                // Orders that were not imported because they belong to another session
                unpaid_skipped_session: 0,
                // The list of session ids to which skipped orders belong.
                unpaid_skipped_sessions: [],
            };

            if (json.paid_orders) {
                for (var i = 0; i < json.paid_orders.length; i++) {
                    this.db.add_order(json.paid_orders[i].data);
                }
                report.paid = json.paid_orders.length;
                this.push_order();
            }

            if (json.unpaid_orders) {

                var orders = [];
                var existing = this.get_order_list();
                var existing_uids = {};
                var skipped_sessions = {};

                for (var i = 0; i < existing.length; i++) {
                    existing_uids[existing[i].uid] = true;
                }

                for (var i = 0; i < json.unpaid_orders.length; i++) {
                    var order = json.unpaid_orders[i];
                    if (order.wp_session_id !== this.wp_session.id) {
                        report.unpaid_skipped_session += 1;
                        skipped_sessions[order.wp_session_id] = true;
                    } else if (existing_uids[order.uid]) {
                        report.unpaid_skipped_existing += 1;
                    } else {
                        orders.push(new exports.Order({}, {
                            wp: this,
                            json: order,
                        }));
                    }
                }

                orders = orders.sort(function (a, b) {
                    return a.sequence_number - b.sequence_number;
                });

                if (orders.length) {
                    report.unpaid = orders.length;
                    this.get('orders').add(orders);
                }

                report.unpaid_skipped_sessions = _.keys(skipped_sessions);
            }

            return report;
        },

        _load_orders: function () {
            var jsons = this.db.get_unpaid_orders();
            var orders = [];
            var not_loaded_count = 0;

            for (var i = 0; i < jsons.length; i++) {
                var json = jsons[i];
                if (json.wp_session_id === this.wp_session.id) {
                    orders.push(new exports.Order({}, {
                        wp: this,
                        json: json,
                    }));
                } else {
                    not_loaded_count += 1;
                }
            }

            if (not_loaded_count) {
                console.info('There are ' + not_loaded_count + ' locally saved unpaid orders belonging to another session');
            }

            orders = orders.sort(function (a, b) {
                return a.sequence_number - b.sequence_number;
            });

            if (orders.length) {
                this.get('orders').add(orders);
            }
        },

    });

    /**
     *  Add fields to the list of read fields when a model is loaded
     *  by the point of sale.
     *  e.g: module.load_fields("product.product",['price','category'])
     * @param model_name
     * @param fields
     */
    exports.load_fields = function (model_name, fields) {
        if (!(fields instanceof Array)) {
            fields = [fields];
        }

        var models = exports.WpModel.prototype.models;
        for (var i = 0; i < models.length; i++) {
            var model = models[i];
            if (model.model === model_name) {
                // if 'fields' is empty all fields are loaded, so we do not need
                // to modify the array
                if ((model.fields instanceof Array) && model.fields.length > 0) {
                    model.fields = model.fields.concat(fields || []);
                }
            }
        }
    };


    /**
     * Loads odoo models at the weighing point startup.
     * load_models take an array of model loader declarations.
     * - The models will be loaded in the array order.
     * - If no odoo model name is provided, no server data
     *   will be loaded, but the system can be used to preprocess
     *   data before load.
     * - loader arguments can be functions that return a dynamic
     *   value. The function takes the WpModel as the first argument
     *   and a temporary object that is shared by all models, and can
     *   be used to store transient information between model loads.
     * - There is no dependency management. The models must be loaded
     *   in the right order. Newly added models are loaded at the end
     *   but the after / before options can be used to load directly
     *   before / after another model.
     *
     * @param models:
     *  [{
     *      model:  [string] the name of the openerp model to load.
     *      label:  [string] The label displayed during load.
     *      fields: [[string]|function] the list of fields to be loaded.
     *              Empty Array / Null loads all fields.
     *      order:  [[string]|function] the models will be ordered by
     *              the provided fields.
     *      domain: [domain|function] the domain that determines what
     *              models need to be loaded. Null loads everything
     *      ids:    [[id]|function] the id list of the models that must
     *              be loaded. Overrides domain.
     *      context: [Dict|function] the openerp context for the model read
     *      condition: [function] do not load the models if it evaluates to
     *                 false.
     *      loaded: [function(self,model)] this function is called once the
     *              models have been loaded, with the data as second argument
     *              if the function returns a deferred, the next model will
     *              wait until it resolves before loading.
     *  }]
     *
     * @param options:
     *  before: [string] The model will be loaded before the named models
     *          (applies to both model name and label)
     *  after:  [string] The model will be loaded after the (last loaded)
     *          named model. (applies to both model name and label)
     */
    exports.load_models = function (models, options) {
        options = options || {};
        if (!(models instanceof Array)) {
            models = [models];
        }

        var pmodels = exports.WpModel.prototype.models;
        var index = pmodels.length;
        if (options.before) {
            for (var i = 0; i < pmodels.length; i++) {
                if (pmodels[i].model === options.before ||
                    pmodels[i].label === options.before) {
                    index = i;
                    break;
                }
            }
        } else if (options.after) {
            for (var i = 0; i < pmodels.length; i++) {
                if (pmodels[i].model === options.after ||
                    pmodels[i].label === options.after) {
                    index = i + 1;
                }
            }
        }
        pmodels.splice.apply(pmodels, [index, 0].concat(models));
    };

    exports.Product = Backbone.Model.extend({
        initialize: function (attr, options) {
            _.extend(this, options);
        },

        /**
         * Part of get_product_price on product.pricelist.
         *
         * Anything related to Unit Of Measure (uom) can be ignored,
         * the WP will always use the default UOM set on the product
         * and the user cannot change it.
         * @param pricelist: items do not have to be sorted.
         *        All product.pricelist.item records are loaded with a search_read
         *        and were automatically sorted based on their _order by the ORM.
         *        After that they are added in this order to the pricelists. //TODO(Vincent)
         * @param quantity
         * @returns {*|number}
         */
        get_price: function (pricelist, quantity) {
            var self = this;
            var date = moment().startOf('day');

            // In case of nested pricelists, it is necessary that all pricelists are made available in
            // the WP. Display a basic alert to the user in this case.
            if (pricelist === undefined) {
                alert(_t(
                    'An error occurred when loading product prices. ' +
                    'Make sure all pricelists are available in the WP.'
                ));
            }

            var category_ids = [];
            var category = this.categ;
            while (category) {
                category_ids.push(category.id);
                category = category.parent;
            }

            var pricelist_items = _.filter(pricelist.items, function (item) {
                return (!item.product_tmpl_id || item.product_tmpl_id[0] === self.product_tmpl_id) &&
                    (!item.product_id || item.product_id[0] === self.id) &&
                    (!item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
                    (!item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                    (!item.date_end || moment(item.date_end).isSameOrAfter(date));
            });

            var price = self.lst_price;
            _.find(pricelist_items, function (rule) {
                if (rule.min_quantity && quantity < rule.min_quantity) {
                    return false;
                }

                if (rule.base === 'pricelist') {
                    price = self.get_price(rule.base_pricelist, quantity);
                } else if (rule.base === 'standard_price') {
                    price = self.standard_price;
                }

                if (rule.compute_price === 'fixed') {
                    price = rule.fixed_price;
                    return true;
                } else if (rule.compute_price === 'percentage') {
                    price = price - (price * (rule.percent_price / 100));
                    return true;
                } else {
                    var price_limit = price;
                    price = price - (price * (rule.price_discount / 100));
                    if (rule.price_round) {
                        price = round_pr(price, rule.price_round);
                    }
                    if (rule.price_surcharge) {
                        price += rule.price_surcharge;
                    }
                    if (rule.price_min_margin) {
                        price = Math.max(price, price_limit + rule.price_min_margin);
                    }
                    if (rule.price_max_margin) {
                        price = Math.min(price, price_limit + rule.price_max_margin);
                    }
                    return true;
                }

                return false;
            });

            // This return value has to be rounded with round_di before
            // being used further. Note that this cannot happen here,
            // because it would cause inconsistencies with the backend for
            // pricelist that have base == 'pricelist'.
            return price;
        },
    });

    return exports;

});
