/*
    Copyright 2019 Coop IT Easy SCRLfs
            Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('weighing_point.scan-container-screen', function (require) {
    "use strict";

    var screens = require('point_of_sale.screens');

    var gui = require('point_of_sale.gui');
    var chrome = require('point_of_sale.chrome');
    var core = require('web.core');
    var rpc = require('web.rpc');
    var QWeb = core.qweb;
    var _t = core._t;

    var ScanContainerScreenWidget = screens.ScreenWidget.extend({
        template: 'ScanContainerScreenWidget',

        show: function(){
            console.log("[SCAN_CONTAINER][show]");
            this._super();
            var self = this;
            var previous_screen = this.gui.get_current_screen_param('previous_screen');
            $('.button.previous-screen').click(function(){
                self.gui.show_screen(previous_screen);
            });
        },
    });

    gui.define_screen({
        name: 'wp-scan-container',
        widget: ScanContainerScreenWidget
    });

    return {
        ScanContainerScreenWidget: ScanContainerScreenWidget,
    }
});
