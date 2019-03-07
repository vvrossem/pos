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

    // include not available => extend
    models.PosModel = models.PosModel.extend({
        get_container_product: function(){
            // assign value if not already assigned.
            // Avoids rewriting init function
            if (!this.container_product){
                this.container_product = this.db.get_product_by_barcode(
                    'CONTAINER');
            }
            return this.container_product
        },
        scan_container: function(parsed_code){
            var selected_order = this.get_order();
            var container = this.db.get_container_by_barcode(
                parsed_code.base_code);

            if(!container){
                return false;
            }

            selected_order.add_container(container);
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

    models.Order = models.Order.extend({
        add_container: function(container, options){
            if(this._printed){
                this.destroy();
                return this.pos.get_order().add_container(container, options);
            }
            options = options || {};
            var attr = JSON.parse(JSON.stringify(container));
            attr.pos = this.pos;
            attr.order = this;
            var product = this.pos.get_container_product();
            var line = new models.Orderline({},
                {pos: this.pos, order: this, product: product});

            line.set_container(container);
            this.orderlines.add(line);
            //self.pos_widget.reload_products(container.pos_categ_ids)

            this.select_orderline(this.get_last_orderline());
            //this.pos.get_order().display_container(container);
        },
    });
    
    // Add container to order line
    models.Orderline = models.Orderline.extend({
        get_container: function(){
            return this.container;
        },
        set_container: function(container){
            this.container = container;
        },
        set_tare_mode: function(mode){
            if (['MAN', 'AUTO'].indexOf(mode)){
                this.tare_mode = mode;
                this.trigger('change', this);
            }
        },
        get_tare_mode: function() {
            return this.tare_mode;
        },
        set_tare: function(tare){
            this.tare = tare;
            this.container = null;
            if(this.tare[0] == '.')
            {
                this.tare = '0' + this.tare
            }
            if (this.gross_weight && this.gross_weight != 'NaN')
            {
                this.set_quantity(this.gross_weight - tare);
            }
            else
            {
                this.gross_weight = this.quantity;
                this.set_quantity(this.quantity - tare);
            }
            this.trigger('change', this);
        },
        get_tare: function(){
            return this.tare;
        },
        get_gross_weight: function(){
            return this.gross_weight;
        },
        set_gross_weight: function(weight){
            this.gross_weight = weight;
            this.trigger('change', this);
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
                str += '|' + container.barcode;
            }
            if(container.name) {
                str += '|' + container.name;
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

    models.load_models({
        model: 'pos.container',
        fields: ['name','barcode', 'weight'],
        // domain: [[]],
        loaded: function(self, containers){
            self.db.add_containers(containers);
        },
    });

});
