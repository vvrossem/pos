/*
    Copyright 2019 Coop IT Easy SCRLfs
    	    Robin Keunen <robin@coopiteasy.be>
    	    Pierrick Brun <pierrick.brun@akretion.com>
    License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
*/


odoo.define('pos_container.container', function (require) {
    "use strict";

    var models_and_db = require('pos_container.models_and_db');

    var screens = require('point_of_sale.screens');
    var gui = require('point_of_sale.gui');
    var models = require('point_of_sale.models');

    var core = require('web.core');
    var rpc = require('web.rpc');
    var QWeb = core.qweb;


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
            this.container_cache = new screens.DomCache();
        },

        show: function(){
            var self = this;
            this._super();
        
            this.$('.back').click(function(){
                self.gui.back();
            });

            this.$('.new-container').click(function(){
                self.display_container_details('edit',{
                });
            });
  
            var containers = this.pos.db.get_containers_sorted(1000);
            this.render_list(containers);

            this.reload_containers();

            if(this.old_container) {
                this.display_container_details('show', this.old_container, 0);
            }

            this.$('.container-list-contents').delegate('.container-line',
                    'click', function(event){
                self.line_select(event,$(this),parseInt($(this).data('id')));
            });

            var search_timeout = null;

            if(this.pos.config.iface_vkeyboard && this.chrome.widget.keyboard){
                this.chrome.widget.keyboard.connect(
                    this.$('.searchbox input')
                );
            }

            this.$('.searchbox input').on('keyup',function(event){
                clearTimeout(search_timeout);

                var query = this.value;

                search_timeout = setTimeout(function(){
                    self.perform_search(query,event.which === 13);
                },70);
            });

            this.$('.searchbox .search-clear').click(function(){
                self.clear_search();
            });
        },
        perform_search: function(query, associate_result){
            if(query){
                var containers = this.pos.db.search_container(query);
                this.display_container_details('hide');
                if ( associate_result && containers.length === 1){
                    this.new_container = containers[0];
                    this.save_changes();
                    this.gui.back();
                }
                this.render_list(containers);
            }else{
                var containers = this.pos.db.get_containers_sorted();
                this.render_list(containers);
            }
        },
        clear_search: function(){
            var containers = this.pos.db.get_containers_sorted(1000);
            this.render_list(containers);
            this.$('.searchbox input')[0].value = '';
            this.$('.searchbox input').focus();
        },
        render_list: function(containers) {
            var contents = this.$el[0].querySelector('.container-list-contents');
            contents.innerHTML = "";
            for(var i = 0, len = Math.min(containers.length,1000); i < len; i++){
                var container    = containers[i];
                var containerline_html = QWeb.render('ContainerLine',{widget: this, container:containers[i]});
                var containerline = document.createElement('tbody');
                containerline.innerHTML = containerline_html;
                containerline = containerline.childNodes[1];

                if(containers === this.new_container) {
                    containerline.classList.add('highlight');
                } else {
                    containerline.classList.remove('highlight');
                }

                contents.appendChild(containerline);
            }
        },
        save_changes: function(){
            this.pos.get('selectedOrder').add_container(this.new_container);
        },
        has_container_changed: function() {
            if(this.old_container && this.new_container) {
                return this.old_container.id !== this.new_container.id;
            } else {
                return !!this.old_container !== !!this.new_container;
            }
        },
        toggle_save_button: function(){
            var $button = this.$('.button.next');
            if (this.editing_container) {
                $button.addClass('oe_hidden');
                return;
            } else if(this.new_container) {
                if(!this.old_container) {
                    $button.text('Set Container');
                } else {
                    $button.text('Change Container');
                }
            } else {
                $button.text('Deselect Container');
            }
            $button.toggleClass('oe_hidden',!this.has_container_changed());
        },
        line_select: function(event,$line,id){
            var container = this.pos.db.get_container_by_id(id);
            this.$('.container-list .lowlight').removeClass('lowlight');
            if ( $line.hasClass('highlight') ){
                $line.removeClass('highlight');
                $line.addClass('lowlight');
                this.display_container_details('hide',container);
                this.new_container = null;
                this.toggle_save_button();
            }else{
                this.$('.container-list .highlight').removeClass('highlight');
                $line.addClass('highlight');
                var y = event.pageY - $line.parent().offset().top
                this.display_container_details('show',container,y);
                this.new_container = container;
                this.toggle_save_button();
            }
        },

        // Ui handle for the 'edit selected container' action
        edit_container_details: function(container){
            this.display_container_details('edit',container);
        },

        // Ui handle for the 'cancel container edit changes' action
        undo_container_details: function(container){
            if (!container.id) {
                this.display_container_details('hide');
            } else {
                this.display_container_details('show', container);
            }
        },

        // What happens when we save the changes on the container edit form -> we fetch the fields, sanitize them,
        // send them to the backend for update, and call saved_container_details() when the server tells us the
        // save was successfull.
        save_container_details: function(container){
            var self = this;

            var fields = {}
            this.$('.container-details-contents .detail').each(function(idx,el){
                fields[el.name] = el.value;
            });
            if (!fields.barcode) {
                this.gui.show_popup('error',{
                    message: 'A Container Barcode Is Required',
                });
                return;
            }
            fields.weight = fields.weight.replace(',', '.')

            fields.id = container.id || false;
            fields.display_name = container.display_name || false;
            fields.barcode = fields.barcode ? this.pos.barcode_reader.barcode_parser.sanitize_ean(fields.barcode) : false;
            fields.weight = fields.weight || false;

            rpc.query({
                model: 'pos.container',
                method: 'create_from_ui',
                args: [fields],
            }).then(function(container_id){
                self.saved_container_details(container_id);
            },function(err,event){
                event.preventDefault();
                self.gui.show_popup('error',{
                    'message':_t('Error: Could not Save Changes'),
                    'comment':_t('Your Internet connection is probably down.'),
                });
            });
        },
        // What happens when we've just pushed modifications for a container of id container_id
        saved_container_details: function(container_id){
            var self = this;
            this.reload_containers().then(function(){
                var container = self.pos.db.get_container_by_id(container_id);
                if (container) {
                    self.new_container = container;
                    self.toggle_save_button();
                    self.display_container_details('show',container);
                } else {
                    // should never happen, because create_from_ui must return the id of the container it
                    // has created, and reload_container() must have loaded the newly created container.
                    self.display_container_details('hide');
                }
            });
        },

        // This fetches container changes on the server, and in case of changes,
        // rerenders the affected views
        reload_containers: function(){
            var self = this;
            return this.pos.load_new_containers().then(function(){
                // containers may have changed in the backend
                self.container_cache = new screens.DomCache();

                self.render_list(self.pos.db.get_containers_sorted(1000));

                var last_orderline = self.pos.get_order().get_last_orderline();

                if(last_orderline) {
                    // update the currently assigned container if it has been changed in db.
                    var curr_container = last_orderline.get_container();
                }

                if (curr_container) {
                    last_orderline.set_container(
                        self.pos.db.get_container_by_id(curr_container.id));
                }
            });
        },

        // Shows,hides or edit the container details box :
        // visibility: 'show', 'hide' or 'edit'
        // container:    the container object to show or edit
        // clickpos:   the height of the click on the list (in pixel), used
        //             to maintain consistent scroll.
        display_container_details: function(visibility,container,clickpos){
            var self = this;
            var contents = this.$('.container-details-contents');
            var parent   = this.$('.container-list').parent();
            var scroll   = parent.scrollTop();
            var height   = contents.height();

            contents.off('click','.button.edit');
            contents.off('click','.button.save');
            contents.off('click','.button.undo');
            contents.on('click','.button.edit',function(){self.edit_container_details(container);});
            contents.on('click','.button.save',function(){self.save_container_details(container);});
            contents.on('click','.button.undo',function(){self.undo_container_details(container);});
            this.editing_container = false;

            if(visibility === 'show'){

                contents.empty();
                contents.append($(QWeb.render('ContainerDetails',{widget:this, container:container})));

                var new_height   = contents.height();

                if(!this.details_visible){
                    if(clickpos < scroll + new_height + 20 ){
                        parent.scrollTop( clickpos - 20 );
                    }else{
                        parent.scrollTop(parent.scrollTop() + new_height);
                    }
                }else{
                    parent.scrollTop(parent.scrollTop() - height + new_height);
                }

                this.details_visible = true;
                this.toggle_save_button();

            } else if (visibility === 'edit') {
                this.editing_container = true;
                contents.empty();
                contents.append($(QWeb.render('ContainerDetailsEdit', {widget:this, container:container})));
                this.toggle_save_button();
            } else if (visibility === 'add_by_scan') {
                new_container = {
                    'display_name': 'Contenant',
                    'barcode': container.parsed_code.base_code,
                    'weight': 0
                }
                this.editing_container = true;
                contents.empty();
                contents.append($(QWeb.render('ContainerDetailsEdit', {widget:this, container:new_container})));
                this.toggle_save_button();

            } else if (visibility === 'hide') {
                contents.empty();
                if(height > scroll) {
                    contents.css({height:height+'px'});
                    contents.animate({height:0},400,function(){
                        contents.css({height:''});
                    });
                } else {
                    parent.scrollTop(parent.scrollTop() - height);
                }
                this.details_visible = false;
                this.toggle_save_button();
            }
        },
        close: function(){
            this._super();
        },

        auto_back: true,
    });

    gui.define_screen({
        name:'containerlist',
        widget: ContainerListScreenWidget
    });

});
