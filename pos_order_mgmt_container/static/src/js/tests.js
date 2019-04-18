odoo.define('pos_order_mgmt_container.tour.reprint', function (require) {
    "use strict";

    var Tour = require('web_tour.tour');

    var steps = [{
        content: 'waiting for loading to finish',
        trigger: '.o_main_content:has(.loader:hidden)',
        run: function () {},
    }, {
        content: "click orders",
        trigger: ".header-button.order-list-button",
    }, {
        content: "reprint last orderline",
        trigger: ".order-line .order-list-reprint",
    }];

    Tour.register('pos_order_mgmt_container', { test: true, url: '/pos/web' }, steps);
});
