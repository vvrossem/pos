/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Robin Keunen <robin@coopiteasy.be>
    	    Pierrick Brun <pierrick.brun@akretion.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/


odoo.define('pos_container.pos_container', function (require) {
    "use strict";

    var screens = require('point_of_sale.screens');
    var gui = require('point_of_sale.gui');
    var models = require('point_of_sale.models');
    var core = require('web.core');


    // models.load_models([
    //     {
    //         model: 'pos.container',
    //         fields: ['name','barcode', 'weight'],
    //         // domain: function(self){ return [['id','=',self.config.loyalty_id[0]]]; },
    //     }]
    // )

    var ContainerButton = screens.ActionButtonWidget.extend({
        template: 'ContainerButton',
        button_click: function(){
            this.gui.show_screen('containerlist');
        }
    });

    screens.define_action_button({
        'name': 'container',
        'widget': ContainerButton,
    });

    var ContainerListScreenWidget = screens.ScreenWidget.extend({
        template: 'ContainerListScreenWidget',

        init: function(parent, options){
            this._super(parent, options);
        },

        auto_back: true,

        show: function(){
            this._super();
        }
    });

    gui.define_screen({
        name:'containerlist',
        widget: ContainerListScreenWidget
    });

});
