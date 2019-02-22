/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Pierrick Brun <pierrick.brun@akretion.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/


odoo.define('pos_container.models_and_db', function (require) {
    "use strict";

    var PosDB = require('point_of_sale.DB');
    var models = require('point_of_sale.models');
    var rpc = require('web.rpc');

    models.load_models({
        model: 'pos.container',
        fields: ['name','barcode', 'weight'],
        // domain: [[]],
        loaded: function(self, containers){
            self.containers = containers;
        },
    });

    // include not available => extend
    models.PosModel = models.PosModel.extend({
        scan_container: function(parsed_code){
            var selectedOrder = this.get('selectedOrder');
            if(parsed_code.encoding === 'barcode'){
                var container = this.db.get_container_by_barcode(parsed_code.base_code);
            }
            if(!container){
                self.pos_widget.screen_selector.set_current_screen('container_scale', {container: parsed_code.base_code});
                return false;
            }

            selectedOrder.addContainer(container);

            return true;
        },
        // reload the list of container, returns as a deferred that resolves if there were
        // updated containers, and fails if not
        load_new_containers: function(){
            var self = this;
            var def  = new $.Deferred();
            var fields = _.find(this.models,function(model){
                return model.model === 'pos.container';
            }).fields;
            var domain = [];
            rpc.query({
                model: 'pos.container',
                method: 'search_read',
                args: [domain, fields],
            }, {
                timeout: 3000,
                shadow: true,
            })
            .then(function(containers){
                if (self.db.add_containers(containers)) {
                    // check if the partners we got were real updates
                    def.resolve();
                } else {
                    def.reject();
                }
            }, function(type,err){ def.reject(); });
           return def;
        },
    });

    PosDB.include({
        init: function(parent, options) {
            this._super(parent, options);

            this.container_sorted = [];
            this.container_by_id = {};
            this.container_by_barcode = {};
            this.container_search_string = "";
            this.container_write_date = null;

        },
        _container_search_string: function(container){

            var str = '';

            if(container.barcode){
                str = '|' + container.barcode;
            }
            str = '' + container.id + ':' + str.replace(':','') + '\n';

            return str;
        },
        add_containers: function(containers) {
            var updated_count = 0;
            var new_write_date = '';
            for(var i = 0, len = containers.length; i < len; i++) {
                var container = containers[i];

                if (this.container_write_date &&
                    this.container_by_id[container.id] &&
                    new Date(this.container_write_date).getTime() + 1000 >=
                    new Date(container.write_date).getTime() ) {
                    // FIXME: The write_date is stored with milisec precision in the database
                    // but the dates we get back are only precise to the second. This means when
                    // you read containers modified strictly after time X, you get back containers that were
                    // modified X - 1 sec ago.
                    continue;
                } else if ( new_write_date < container.write_date ) {
                    new_write_date  = container.write_date;
                }
                if (!this.container_by_id[container.id]) {
                    this.container_sorted.push(container.id);
                }
                this.container_by_id[container.id] = container;

                updated_count += 1;
            }

            this.container_write_date = new_write_date || this.container_write_date;

            if (updated_count) {
                // If there were updates, we need to completely
                // rebuild the search string and the barcode indexing

                this.container_search_string = "";
                this.container_by_barcode = {};

                for (var id in this.container_by_id) {
                    var container = this.container_by_id[id];

                    if(container.barcode){
                        this.container_by_barcode[container.barcode] = container;
                    }
                    this.container_search_string += this._container_search_string(container);
                }
            }
            return updated_count;
        },
        get_container_write_date: function(){

            return this.container_write_date;
        },
        get_container_by_id: function(id){
            return this.container_by_id[id];
        },
        get_container_by_barcode: function(barcode){

            return this.container_by_barcode[barcode];
        },
        get_containers_sorted: function(max_count){
            max_count = max_count ? Math.min(this.container_sorted.length, max_count) : this.container_sorted.length;
            var containers = [];
            for (var i = 0; i < max_count; i++) {
                containers.push(this.container_by_id[this.container_sorted[i]]);
            }

            return containers;
        },
        search_container: function(query) {
            try {
                query = query.replace(/[\[\]\(\)\+\*\?\.\-\!\&\^\$\|\~\_\{\}\:\,\\\/]/g,'.');
                query = query.replace(' ','.+');
                var re = RegExp("([0-9]+):.*?"+query,"gi");
            } catch(e) {
                return [];
            }
            var results = [];
            for(var i = 0; i < this.limit; i++) {
               var r = re.exec(this.container_search_string);
                if(r) {
                    var id = Number(r[1]);
                    results.push(this.get_container_by_id(id));
                } else {
                    break;
                }
            }

            return results;
        },

    });
});
