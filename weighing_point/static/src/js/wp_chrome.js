odoo.define('weighing_point.chrome', function (require) {
    "use strict";

    var WpBaseWidget = require('weighing_point.BaseWidget');
    var gui = require('point_of_sale.gui'); // TODO
    var keyboard = require('point_of_sale.keyboard'); // TODO
    var models = require('point_of_sale.models'); // TODO
    var AbstractAction = require('web.AbstractAction');
    var core = require('web.core');
    var ajax = require('web.ajax');
    var CrashManager = require('web.CrashManager');
    var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;


    var _t = core._t;
    var _lt = core._lt;
    var QWeb = core.qweb;


    /* -------- The Header Button --------- */

    /**
     * Used to quickly add buttons with simple
     * labels and actions to the weighing point header
     */

    var HeaderButtonWidget = WpBaseWidget.extend({
        template: 'HeaderButtonWidget',
        init: function (parent, options) {
            options = options || {};
            this._super(parent, options);
            this.action = options.action;
            this.label = options.label;
        },
        renderElement: function () {
            var self = this;
            this._super();
            if (this.action) {
                this.$el.click(function () {
                    self.action();
                });
            }
        },
        show: function () {
            this.$el.removeClass('oe_hidden');
        },
        hide: function () {
            this.$el.addClass('oe_hidden');
        },
    });

    /* --------- The Debug Widget --------- */

    /**
     * The debug widget lets the user control
     * and monitor the hardware and software status
     * without the use of the proxy, or to access
     * the raw locally stored db values, useful
     * for debugging
     */
    //TODO
    var DebugWidget = WpBaseWidget.extend({
        template: "DebugWidget",
        eans: {
            admin_badge: '0410100000006',
            client_badge: '0420200000004',
            invalid_ean: '1232456',
            soda_33cl: '5449000000996',
            oranges_kg: '2100002031410',
            lemon_price: '2301000001560',
            unknown_product: '9900000000004',
        },
        events: [
            'open_cashbox',
            'print_receipt',
            'scale_read',
        ],
        init: function (parent, options) {
            this._super(parent, options);
            var self = this;

            // for dragging the debug widget around
            this.dragging = false;
            this.dragwp = {x: 0, y: 0};

            function eventwp(event) {
                if (event.touches && event.touches[0]) {
                    return {x: event.touches[0].screenX, y: event.touches[0].screenY};
                } else {
                    return {x: event.screenX, y: event.screenY};
                }
            }

            this.dragend_handler = function (event) {
                self.dragging = false;
            };
            this.dragstart_handler = function (event) {
                self.dragging = true;
                self.dragwp = eventwp(event);
            };
            this.dragmove_handler = function (event) {
                if (self.dragging) {
                    var top = this.offsetTop;
                    var left = this.offsetLeft;
                    var wp = eventwp(event);
                    var dx = wp.x - self.dragwp.x;
                    var dy = wp.y - self.dragwp.y;

                    self.dragwp = wp;

                    this.style.right = 'auto';
                    this.style.bottom = 'auto';
                    this.style.left = left + dx + 'px';
                    this.style.top = top + dy + 'px';
                }
                event.preventDefault();
                event.stopPropagation();
            };
        },
        show: function () {
            this.$el.css({opacity: 0});
            this.$el.removeClass('oe_hidden');
            this.$el.animate({opacity: 1}, 250, 'swing');
        },
        hide: function () {
            var self = this;
            this.$el.animate({opacity: 0,}, 250, 'swing', function () {
                self.$el.addClass('oe_hidden');
            });
        },
        start: function () {
            var self = this;

            if (this.wp.debug) {
                this.show();
            }

            this.el.addEventListener('mouseleave', this.dragend_handler);
            this.el.addEventListener('mouseup', this.dragend_handler);
            this.el.addEventListener('touchend', this.dragend_handler);
            this.el.addEventListener('touchcancel', this.dragend_handler);
            this.el.addEventListener('mousedown', this.dragstart_handler);
            this.el.addEventListener('touchstart', this.dragstart_handler);
            this.el.addEventListener('mousemove', this.dragmove_handler);
            this.el.addEventListener('touchmove', this.dragmove_handler);

            this.$('.toggle').click(function () {
                self.hide();
            });
            this.$('.button.set_weight').click(function () {
                var kg = Number(self.$('input.weight').val());
                if (!isNaN(kg)) {
                    self.wp.proxy.debug_set_weight(kg);
                }
            });
            this.$('.button.reset_weight').click(function () {
                self.$('input.weight').val('');
                self.wp.proxy.debug_reset_weight();
            });
            this.$('.button.custom_ean').click(function () {
                var ean = self.wp.barcode_reader.barcode_parser.sanitize_ean(self.$('input.ean').val() || '0');
                self.$('input.ean').val(ean);
                self.wp.barcode_reader.scan(ean);
            });
            this.$('.button.barcode').click(function () {
                self.wp.barcode_reader.scan(self.$('input.ean').val());
            });
            this.$('.button.delete_orders').click(function () {
                self.gui.show_popup('confirm', {
                    'title': _t('Delete Paid Orders ?'),
                    'body': _t('This operation will permanently destroy all paid orders from the local storage. You will lose all the data. This operation cannot be undone.'),
                    confirm: function () {
                        self.wp.db.remove_all_orders();
                        self.wp.set({synch: {state: 'connected', pending: 0}});
                    },
                });
            });
            this.$('.button.delete_unpaid_orders').click(function () {
                self.gui.show_popup('confirm', {
                    'title': _t('Delete Unpaid Orders ?'),
                    'body': _t('This operation will destroy all unpaid orders in the browser. You will lose all the unsaved data and exit the point of sale. This operation cannot be undone.'),
                    confirm: function () {
                        self.wp.db.remove_all_unpaid_orders();
                        window.location = '/';
                    },
                });
            });

            this.$('.button.export_unpaid_orders').click(function () {
                self.gui.prepare_download_link(
                    self.wp.export_unpaid_orders(),
                    _t("unpaid orders") + ' ' + moment().format('YYYY-MM-DD-HH-mm-ss') + '.json',
                    ".export_unpaid_orders", ".download_unpaid_orders"
                );
            });

            this.$('.button.export_paid_orders').click(function () {
                self.gui.prepare_download_link(
                    self.wp.export_paid_orders(),
                    _t("paid orders") + ' ' + moment().format('YYYY-MM-DD-HH-mm-ss') + '.json',
                    ".export_paid_orders", ".download_paid_orders"
                );
            });

            this.$('.button.display_refresh').click(function () {
                self.wp.proxy.message('display_refresh', {});
            });

            this.$('.button.import_orders input').on('change', function (event) {
                var file = event.target.files[0];

                if (file) {
                    var reader = new FileReader();

                    reader.onload = function (event) {
                        var report = self.wp.import_orders(event.target.result);
                        self.gui.show_popup('orderimport', {report: report});
                    };

                    reader.readAsText(file);
                }
            });

            _.each(this.events, function (name) {
                self.wp.proxy.add_notification(name, function () {
                    self.$('.event.' + name).stop().clearQueue().css({'background-color': '#6CD11D'});
                    self.$('.event.' + name).animate({'background-color': '#1E1E1E'}, 2000);
                });
            });
        },
    });

    /* --------- The Status Widget -------- */

    /**
     * Base class for widgets that want to display
     * status in the weighing point header.
     */
    var StatusWidget = WpBaseWidget.extend({
        status: ['connected', 'connecting', 'disconnected', 'warning', 'error'],

        set_status: function (status, msg) {
            for (var i = 0; i < this.status.length; i++) {
                this.$('.js_' + this.status[i]).addClass('oe_hidden');
            }
            this.$('.js_' + status).removeClass('oe_hidden');

            if (msg) {
                this.$('.js_msg').removeClass('oe_hidden').html(msg);
            } else {
                this.$('.js_msg').addClass('oe_hidden').html('');
            }
        },
    });


    /* --------- The Proxy Status --------- */



    /**
     * Displays the status of the hardware proxy
     * (connected, disconnected, errors ... )
     */
    //TODO
    var ProxyStatusWidget = StatusWidget.extend({
        template: 'ProxyStatusWidget',
        set_smart_status: function (status) {
            if (status.status === 'connected') {
                var warning = false;
                var msg = '';
                if (this.wp.config.iface_scan_via_proxy) {
                    var scanner = status.drivers.scanner ? status.drivers.scanner.status : false;
                    if (scanner != 'connected' && scanner != 'connecting') {
                        warning = true;
                        msg += _t('Scanner');
                    }
                }
                if (this.wp.config.iface_print_via_proxy || this.wp.config.iface_cashdrawer) {
                    var printer = status.drivers.escpos ? status.drivers.escpos.status : false;
                    if (printer != 'connected' && printer != 'connecting') {
                        warning = true;
                        msg = msg ? msg + ' & ' : msg;
                        msg += _t('Printer');
                    }
                }
                if (this.wp.config.iface_electronic_scale) {
                    var scale = status.drivers.scale ? status.drivers.scale.status : false;
                    if (scale != 'connected' && scale != 'connecting') {
                        warning = true;
                        msg = msg ? msg + ' & ' : msg;
                        msg += _t('Scale');
                    }
                }

                msg = msg ? msg + ' ' + _t('Offline') : msg;
                this.set_status(warning ? 'warning' : 'connected', msg);
            } else {
                this.set_status(status.status, '');
            }
        },
        start: function () {
            var self = this;

            this.set_smart_status(this.wp.proxy.get('status'));

            this.wp.proxy.on('change:status', this, function (eh, status) { //FIXME remove duplicate changes
                self.set_smart_status(status.newValue);
            });

            this.$el.click(function () {
                self.wp.connect_to_proxy();
            });
        },
    });



    /*--------------------------------------*\
     |             THE CHROME               |
    \*======================================*/

    /**
     * The Chrome is the main widget that contains
     * all other widgets in the Weighing Point.
     *
     * It mimics the one from the Point Of Sale.
     *
     * It is the first object instanciated and the
     * starting point of the weighing point code.
     *
     * It is mainly composed of :
     * - a header, containing ... //TODO
     * - a leftpane, containing the scale widget //TODO
     * - a rightpane, containing the screens (see wp_screens.js) //TODO
     * - popups
     * - an onscreen keyboard
     * - .gui which controls the switching between
     *   screens and the showing/closing of popups
     */

    // TODO
    var Chrome = WpBaseWidget.extend(AbstractAction.prototype, {
        template: 'Chrome',
        init: function () {
            var self = this;
            this._super(arguments[0], {});

            this.started = new $.Deferred(); // resolves when DOM is online
            this.ready = new $.Deferred(); // resolves when the whole GUI has been loaded

            this.wp = new models.WpModel(this.getSession(), {chrome: this}); //TODO
            this.gui = new gui.Gui({wp: this.wp, chrome: this});
            this.chrome = this; // So that chrome's childs have chrome set automatically
            this.wp.gui = this.gui;

            this.logo_click_time = 0;
            this.logo_click_count = 0;

            this.previous_touch_y_coordinate = -1;

            this.widget = {};   // contains references to subwidgets instances

            this.cleanup_dom();

            this.wp.ready.done(function () {
                self.build_chrome();
                self.build_widgets();
                self.disable_rubberbanding();
                self.disable_backpace_back();
                self.ready.resolve();
                self.loading_hide();
                self.replace_crashmanager();
                self.wp.push_order();
            }).fail(function (err) {   // error when loading models data from the backend
                self.loading_error(err);
            });
        },

        cleanup_dom: function () {
            // remove default webclient handlers that induce click delay
            $(document).off();
            $(window).off();
            $('html').off();
            $('body').off();
            // The above lines removed the bindings, but we really need them for the barcode
            BarcodeEvents.start();
        },

        build_chrome: function () {
            var self = this;

            if ($.browser.chrome) {
                var chrome_version = $.browser.version.split('.')[0];
                if (parseInt(chrome_version, 10) >= 50) {
                    ajax.loadCSS('/point_of_sale/static/src/css/chrome50.css'); //TODO
                }
            }

            this.renderElement();

            this.$('.wp-logo').click(function () {
                self.click_logo();
            });

            if (this.wp.config.iface_big_scrollbars) { //TODO
                this.$el.addClass('big-scrollbars');
            }
        },

        // displays a system error with the error-traceback
        // popup.
        show_error: function (error) {
            this.gui.show_popup('error-traceback', {
                'title': error.message,
                'body': error.message + '\n' + error.data.debug + '\n',
            });
        },

        // replaces the error handling of the existing crashmanager which
        // uses jquery dialog to display the error, to use the wp popup
        // instead
        replace_crashmanager: function () {
            var self = this;
            CrashManager.include({
                show_error: function (error) {
                    if (self.gui) {
                        self.show_error(error);
                    } else {
                        this._super(error);
                    }
                },
            });
        },

        click_logo: function () {
            if (this.wp.debug) {
                this.widget.debug.show();
            } else {
                var self = this;
                var time = (new Date()).getTime();
                var delay = 500;
                if (this.logo_click_time + 500 < time) {
                    this.logo_click_time = time;
                    this.logo_click_count = 1;
                } else {
                    this.logo_click_time = time;
                    this.logo_click_count += 1;
                    if (this.logo_click_count >= 6) {
                        this.logo_click_count = 0;
                        this.gui.sudo().then(function () {
                            self.widget.debug.show();
                        });
                    }
                }
            }
        },

        _scrollable: function (element, scrolling_down) {
            var $element = $(element);
            var scrollable = true;

            if (!scrolling_down && $element.scrollTop() <= 0) {
                scrollable = false;
            } else if (scrolling_down && $element.scrollTop() + $element.height() >= element.scrollHeight) {
                scrollable = false;
            }

            return scrollable;
        },

        disable_rubberbanding: function () {
            var self = this;

            document.body.addEventListener('touchstart', function (event) {
                self.previous_touch_y_coordinate = event.touches[0].clientY;
            });

            // prevent the pos body from being scrollable.
            document.body.addEventListener('touchmove', function (event) {
                var node = event.target;
                var current_touch_y_coordinate = event.touches[0].clientY;
                var scrolling_down;

                if (current_touch_y_coordinate < self.previous_touch_y_coordinate) {
                    scrolling_down = true;
                } else {
                    scrolling_down = false;
                }

                while (node) {
                    if (node.classList && node.classList.contains('touch-scrollable') && self._scrollable(node, scrolling_down)) {
                        return;
                    }
                    node = node.parentNode;
                }
                event.preventDefault();
            });
        },

        // prevent backspace from performing a 'back' navigation
        disable_backpace_back: function () {
            $(document).on("keydown", function (e) {
                if (e.which === 8 && !$(e.target).is("input, textarea")) {
                    e.preventDefault();
                }
            });
        },

        loading_error: function (err) {
            var self = this;

            var title = err.message;
            var body = err.stack;

            if (err.message === 'XmlHttpRequestError ') {
                title = 'Network Failure (XmlHttpRequestError)';
                body = 'The Weighing Point could not be loaded due to a network problem.\n Please check your internet connection.';
            } else if (err.message === 'TLSError') {
                title = 'Https connection to IoT Box failed';
                body = 'Make sure you are using IoT Box v18.12 or higher.\n\n Navigate to ' + err.url + ' to accept the certificate of your IoT Box.';
            } else if (err.code === 200) {
                title = err.data.message;
                body = err.data.debug;
            }

            if (typeof body !== 'string') {
                body = 'Traceback not available.';
            }

            var popup = $(QWeb.render('ErrorTracebackPopupWidget', {
                widget: {options: {title: title, body: body}},
            }));

            popup.find('.button').click(function () {
                self.gui.close();
            });

            popup.css({zindex: 9001});

            popup.appendTo(this.$el);
        },
        loading_progress: function (fac) {
            this.$('.loader .loader-feedback').removeClass('oe_hidden');
            this.$('.loader .progress').removeClass('oe_hidden').css({'width': '' + Math.floor(fac * 100) + '%'});
        },
        loading_message: function (msg, progress) {
            this.$('.loader .loader-feedback').removeClass('oe_hidden');
            this.$('.loader .message').text(msg);
            if (typeof progress !== 'undefined') {
                this.loading_progress(progress);
            } else {
                this.$('.loader .progress').addClass('oe_hidden');
            }
        },
        loading_skip: function (callback) {
            if (callback) {
                this.$('.loader .loader-feedback').removeClass('oe_hidden');
                this.$('.loader .button.skip').removeClass('oe_hidden');
                this.$('.loader .button.skip').off('click');
                this.$('.loader .button.skip').click(callback);
            } else {
                this.$('.loader .button.skip').addClass('oe_hidden');
            }
        },
        loading_hide: function () {
            var self = this;
            this.$('.loader').animate({opacity: 0}, 1500, 'swing', function () {
                self.$('.loader').addClass('oe_hidden');
            });
        },
        loading_show: function () {
            this.$('.loader').removeClass('oe_hidden').animate({opacity: 1}, 150, 'swing');
        },
        widgets: [
            {
                'name': 'proxy_status',
                'widget': ProxyStatusWidget,
                'append': '.wp-rightheader',
                'condition': function () {
                    return this.wp.config.use_proxy;
                },
            }, {
                'name': 'close_button',
                'widget': HeaderButtonWidget,
                'append': '.wp-rightheader',
                'args': {
                    label: _lt('Close'),
                    action: function () {
                        var self = this;
                        if (!this.confirmed) {
                            this.$el.addClass('confirm');
                            this.$el.text(_t('Confirm'));
                            this.confirmed = setTimeout(function () {
                                self.$el.removeClass('confirm');
                                self.$el.text(_t('Close'));
                                self.confirmed = false;
                            }, 2000);
                        } else {
                            clearTimeout(this.confirmed);
                            this.gui.close();
                        }
                    },
                }
            }, {
                'name': 'keyboard',
                'widget': keyboard.OnscreenKeyboardWidget,
                'replace': '.placeholder-OnscreenKeyboardWidget',
            }, {
                'name': 'debug',
                'widget': DebugWidget,
                'append': '.wp-content',
            },
        ],

        // This method instantiates all the screens, widgets, etc.
        build_widgets: function () {
            var classe;

            for (var i = 0; i < this.widgets.length; i++) {
                var def = this.widgets[i];
                if (!def.condition || def.condition.call(this)) {
                    var args = typeof def.args === 'function' ? def.args(this) : def.args;
                    var w = new def.widget(this, args || {});
                    if (def.replace) {
                        w.replace(this.$(def.replace));
                    } else if (def.append) {
                        w.appendTo(this.$(def.append));
                    } else if (def.prepend) {
                        w.prependTo(this.$(def.prepend));
                    } else {
                        w.appendTo(this.$el);
                    }
                    this.widget[def.name] = w;
                }
            }

            this.screens = {};
            for (i = 0; i < this.gui.screen_classes.length; i++) {
                classe = this.gui.screen_classes[i];
                if (!classe.condition || classe.condition.call(this)) {
                    var screen = new classe.widget(this, {});
                    screen.appendTo(this.$('.screens'));
                    this.screens[classe.name] = screen;
                    this.gui.add_screen(classe.name, screen);
                }
            }

            this.popups = {};
            for (i = 0; i < this.gui.popup_classes.length; i++) {
                classe = this.gui.popup_classes[i];
                if (!classe.condition || classe.condition.call(this)) {
                    var popup = new classe.widget(this, {});
                    popup.appendTo(this.$('.popups'));
                    this.popups[classe.name] = popup;
                    this.gui.add_popup(classe.name, popup);
                }
            }

            this.gui.set_startup_screen('products'); //TODO
            this.gui.set_default_screen('products'); //TODO

        },

        destroy: function () {
            this.wp.destroy();
            this._super();
        }
    });

    return {
        Chrome: Chrome,
        DebugWidget: DebugWidget,
        HeaderButtonWidget: HeaderButtonWidget,
        ProxyStatusWidget: ProxyStatusWidget,
        StatusWidget: StatusWidget,
    };
});
