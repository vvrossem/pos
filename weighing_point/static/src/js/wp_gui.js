odoo.define('weighing_point.gui', function (require) {
    "use strict";

//

    /**
     * This file contains the gui, which is the Weighing Point (wp) 'controller'.
     *
     * It is a modified version of the point_of_sale (pos) gui.
     *
     * It contains high level methods to manipulate the interface
     * such as changing between screens, creating popups, etc.
     *
     * It is available to all wp objects trough the '.gui' field.
     */
    var core = require('web.core');
    var field_utils = require('web.field_utils');
    var session = require('web.session');

    var _t = core._t;

    var Gui = core.Class.extend({
        screen_classes: [],
        popup_classes: [],
        init: function (options) {
            var self = this;
            this.wp = options.wp;
            this.chrome = options.chrome;
            this.screen_instances = {};
            this.popup_instances = {};
            this.default_screen = null;
            this.startup_screen = null;
            this.current_popup = null;
            this.current_screen = null;

            this.chrome.ready.then(function () {
                self.close_other_tabs();
                self.show_screen(self.startup_screen);
            });
        },

        /* ---- Gui: SCREEN MANIPULATION ---- */

        /**
         * Register a screen widget to the GUI.
         * It mus have been inserted into the DOM.
         * @param name
         * @param screen
         */
        add_screen: function (name, screen) {
            screen.hide();
            this.screen_instances[name] = screen;
        },

        /**
         * Sets the screen that will be displayed as default_screen
         * @param name
         */
        set_default_screen: function (name) {
            this.default_screen = name;
        },

        /**
         * Sets the screen that will be displayed as startup_screen
         * @param name
         */
        set_startup_screen: function (name) {
            this.startup_screen = name;
        },

        /**
         * Display a screen
         * @param screen_name
         * @param params: used to load a screen with parameters,
         *        (ie. loading a 'product_details' screen for a specific product)
         * @param refresh: if you want the screen to cycle trough show / hide even
         *        if you are already on the same screen.
         * @param skip_close_popup
         */
        show_screen: function (screen_name, params, refresh, skip_close_popup) {
            var screen = this.screen_instances[screen_name];
            if (!screen) {
                console.error("ERROR: show_screen(" + screen_name + ") : screen not found");
            }
            if (!skip_close_popup) {
                this.close_popup();
            }

            if (refresh || screen !== this.current_screen) {
                if (this.current_screen) {
                    this.current_screen.close();
                    this.current_screen.hide();
                }
                this.current_screen = screen;
                this.current_screen.show(refresh);
            }
        },


        /**
         * Returns the current screen
         */
        //TODO
        get_current_screen: function () {
            return this.wp.get_order() ? (this.wp.get_order().get_screen_data('screen') || this.default_screen) : this.startup_screen;
        },

        /**
         * Goes to the previous screen.
         * The history only goes 1 level deep.
         */
        //TODO
        back: function () {
            var previous = this.wp.get_order().get_screen_data('previous-screen');
            if (previous) {
                this.show_screen(previous);
            }
        },

        /**
         * Returns the parameter specified when this screen was displayed
         * @param param
         */
        //TODO
        get_current_screen_param: function (param) {
            if (this.wp.get_order()) {
                var params = this.wp.get_order().get_screen_data('params');
                return params ? params[param] : undefined;
            } else {
                return undefined;
            }
        },

        /* ---- Gui: POPUP MANIPULATION ---- */
        /**
         * Registers a new popup in the GUI.
         * The popup must have been previously inserted into the DOM.
         * @param name
         * @param popup
         */
        add_popup: function (name, popup) {
            popup.hide();
            this.popup_instances[name] = popup;
        },


        /**
         * Displays a popup.
         * Popup don't stack and are closed by screen changes or new popups.
         * @param name
         * @param options
         */
        show_popup: function (name, options) {
            if (this.current_popup) {
                this.close_popup();
            }
            this.current_popup = this.popup_instances[name];
            return this.current_popup.show(options);
        },

        // close the current popup.
        /**
         * Close the current popup.
         */
        close_popup: function () {
            if (this.current_popup) {
                this.current_popup.close();
                this.current_popup.hide();
                this.current_popup = null;
            }
        },

        /**
         * Returns true if there is an active popup, false otherwise
         */
        has_popup: function () {
            return !!this.current_popup;
        },

        /* ---- Gui: INTER TAB COMM ---- */

        /**
         * Sets up automatic wp exit when open in another tab.
         */
        close_other_tabs: function () {
            var self = this;

            // avoid closing itself
            var now = Date.now();

            localStorage['message'] = '';
            localStorage['message'] = JSON.stringify({
                'message': 'close_tabs',
                'session': this.wp.wp_session.id,
                'window_uid': now,
            });

            // storage events are (most of the time) triggered only when the
            // localstorage is updated in a different tab.
            // some browsers (e.g. IE) does trigger an event in the same tab
            // This may be a browser bug or a different interpretation of the HTML spec
            // cf https://connect.microsoft.com/IE/feedback/details/774798/localstorage-event-fired-in-source-window
            // Use window_uid parameter to exclude the current window
            window.addEventListener("storage", function (event) {
                var msg = event.data;

                if (event.key === 'message' && event.newValue) {

                    var msg = JSON.parse(event.newValue);
                    if (msg.message === 'close_tabs' &&
                        msg.session == self.wp.wp_session.id &&
                        msg.window_uid != now) {

                        console.info('WP / Session opened in another window. EXITING WP')
                        self._close();
                    }
                }

            }, false);
        },

        /* ---- Gui: ACCESS CONTROL ---- */

        /**
         * checks if the current user (or the user provided) has manager access rights.
         * If not, a popup is shown allowing the user to temporarily login as an administrator.
         * This method returns a deferred, that succeeds with the manager user when the login is successfull.
         * @param user
         */
        sudo: function (user) {
            user = user || this.wp.get_cashier();

            if (user.role === 'manager') {
                return new $.Deferred().resolve(user);
            } else {
                return this.select_user({
                    security: true,
                    only_managers: true,
                    title: _t('Login as a Manager'),
                });
            }
        },

        /* ---- Gui: CLOSING THE POINT OF SALE ---- */

        close: function () {
            var self = this;
            this._close();
        },

        _close: function () {
            var self = this;
            this.chrome.loading_show();
            this.chrome.loading_message(_t('Closing ...'));

            //TODO promise ?
            var url = "/web#action=point_of_sale.action_client_wp_menu";
            window.location = session.debug ? $.param.querystring(url, {debug: session.debug}) : url;

        },

        /* ---- Gui: SOUND ---- */

        play_sound: function (sound) {
            var src = '';
            if (sound === 'error') {
                src = "/weighing_point/static/src/sounds/error.wav";
            } else if (sound === 'bell') {
                src = "/weighing_point/static/src/sounds/bell.wav";
            } else {
                console.error('Unknown sound: ', sound);
                return;
            }
            $('body').append('<audio src="' + src + '" autoplay="true"></audio>');
        },

        /* ---- Gui: FILE I/O ---- */

        //TODO(Vincent) useful ?

        // This will make the browser download 'contents' as a
        // file named 'name'
        // if 'contents' is not a string, it is converted into
        // a JSON representation of the contents.


        // TODO: remove me in master: deprecated in favor of prepare_download_link
        // this method is kept for backward compatibility but is likely not going
        // to work as many browsers do to not accept fake click events on links
        download_file: function (contents, name) {
            href_params = this.prepare_file_blob(contents, name);
            var evt = document.createEvent("HTMLEvents");
            evt.initEvent("click");

            $("<a>", href_params).get(0).dispatchEvent(evt);

        },

        prepare_download_link: function (contents, filename, src, target) {
            var href_params = this.prepare_file_blob(contents, filename);

            $(target).parent().attr(href_params);
            $(src).addClass('oe_hidden');
            $(target).removeClass('oe_hidden');

            // hide again after click
            $(target).click(function () {
                $(src).removeClass('oe_hidden');
                $(this).addClass('oe_hidden');
            });
        },

        prepare_file_blob: function (contents, name) {
            var URL = window.URL || window.webkitURL;

            if (typeof contents !== 'string') {
                contents = JSON.stringify(contents, null, 2);
            }

            var blob = new Blob([contents]);

            return {
                download: name || 'document.txt',
                href: URL.createObjectURL(blob),
            }
        },

        /* ---- Gui: EMAILS ---- */

        // This will launch the user's email software
        // with a new email with the address, subject and body
        // prefilled.

        send_email: function (address, subject, body) {
            window.open("mailto:" + address +
                "?subject=" + (subject ? window.encodeURIComponent(subject) : '') +
                "&body=" + (body ? window.encodeURIComponent(body) : ''));
        },

        /* ---- Gui: KEYBOARD INPUT ---- */

        // This is a helper to handle numpad keyboard input.
        // - buffer: an empty or number string
        // - input:  '[0-9],'+','-','.','CLEAR','BACKSPACE'
        // - options: 'firstinput' -> will clear buffer if
        //     input is '[0-9]' or '.'
        //  returns the new buffer containing the modifications
        //  (the original is not touched)
        numpad_input: function (buffer, input, options) {
            var newbuf = buffer.slice(0);
            options = options || {};
            var newbuf_float = field_utils.parse.float(newbuf);
            var decimal_point = _t.database.parameters.decimal_point;

            if (input === decimal_point) {
                if (options.firstinput) {
                    newbuf = "0.";
                } else if (!newbuf.length || newbuf === '-') {
                    newbuf += "0.";
                } else if (newbuf.indexOf(decimal_point) < 0) {
                    newbuf = newbuf + decimal_point;
                }
            } else if (input === 'CLEAR') {
                newbuf = "";
            } else if (input === 'BACKSPACE') {
                newbuf = newbuf.substring(0, newbuf.length - 1);
            } else if (input === '+') {
                if (newbuf[0] === '-') {
                    newbuf = newbuf.substring(1, newbuf.length);
                }
            } else if (input === '-') {
                if (newbuf[0] === '-') {
                    newbuf = newbuf.substring(1, newbuf.length);
                } else {
                    newbuf = '-' + newbuf;
                }
            } else if (input[0] === '+' && !isNaN(parseFloat(input))) {
                newbuf = this.chrome.format_currency_no_symbol(newbuf_float + parseFloat(input));
            } else if (!isNaN(parseInt(input))) {
                if (options.firstinput) {
                    newbuf = '' + input;
                } else {
                    newbuf += input;
                }
            }

            // End of input buffer at 12 characters.
            if (newbuf.length > buffer.length && newbuf.length > 12) {
                this.play_sound('bell');
                return buffer.slice(0);
            }

            return newbuf;
        },
    });

    var define_screen = function (classe) {
        Gui.prototype.screen_classes.push(classe);
    };

    var define_popup = function (classe) {
        Gui.prototype.popup_classes.push(classe);
    };

    return {
        Gui: Gui,
        define_screen: define_screen,
        define_popup: define_popup,
    };

});
