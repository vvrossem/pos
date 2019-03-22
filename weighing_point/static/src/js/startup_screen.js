/*
    Copyright 2019 Coop IT Easy SCRLfs
            Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('weighing_point.startup-screen', function (require) {
    "use strict";

    var screens = require('point_of_sale.screens');

    var CategoriesScreenWidget = require('weighing_point.categories').CategoriesScreenWidget;

    var gui = require('point_of_sale.gui');
    var chrome = require('point_of_sale.chrome');
    var core = require('web.core');
    var rpc = require('web.rpc');
    var QWeb = core.qweb;
    var _t = core._t;

    var StartupScreenWidget = screens.ScreenWidget.extend({
        template: 'StartupScreenWidget',

        show: function(){
            console.log("[STARTUP][show]");
            this._super();
            var self = this;
            this.$('.button.weigh-bag').click(function () {
                console.log('peser un sachet plein');
                self.gui.show_screen('wp-categories', {previous_screen: 'wp-startup'});
            });

            this.$('.button.weigh-container').click(function () {
                console.log('peser un contenant vide');
                self.gui.show_screen('wp-weigh-container', {previous_screen: 'wp-startup'});
            });

            this.$('.button.scan-container').click(function () {
                console.log('peser un contenant vide');
                self.gui.show_screen('wp-scan-container', {previous_screen: 'wp-startup'});
            });
        },
    });

    gui.define_screen({
        name: 'wp-startup',
        widget: StartupScreenWidget
    });

    // Add the StartupScreen to the GUI, and set it as the default & startup screen
    chrome.Chrome.include({
        build_widgets: function () {
            this._super();
            this.gui.set_default_screen('wp-startup');
            this.gui.set_startup_screen('wp-startup');
        },
    });

    return {
        StartupScreenWidget: StartupScreenWidget,
    }
});
