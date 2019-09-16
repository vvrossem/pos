/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Robin Keunen <robin@coopiteasy.be>
    	    Vincent Van Rossem <vvrossem@gmail.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/

odoo.define('pos_toledo_product.devices', function (require) {
    "use strict";

    var devices = require('point_of_sale.devices');

    devices.ProxyDevice.include({

        // reset the weight on the scale.
        reset_weight: function () {
            var ret = new $.Deferred();
            this.message('reset_weight').then(function(status) {
                ret.resolve(status)
            });
            return ret;
        },

        reset_tare: function(){
            var ret = new $.Deferred();
            this.message('scale_price',{price: '000000'})
                .then(function(weight){
                    ret.resolve(weight);
                });
            return ret;
        },

        scale_read_data_price_tare: function(price, tare){
            var self = this;
            var ret = new $.Deferred();
            if (self.use_debug_weight) {
                return (new $.Deferred()).resolve({weight:this.debug_weight, unit:'kg', info:'ok'});
            }
            this.message('scale_price_tare',{price:price, tare:tare})
                .then(function(weight){
                    ret.resolve(weight);
                }, function(){
                    ret.resolve({weight:0.0, unit:'kg', info:'ko'});
                });
            return ret;
        },
    });
});
