odoo.define('pos_container.tour.tare', function (require) {
    "use strict";

    var Tour = require('web_tour.tour');

    function click_numpad(num) {
        return {
            content: "click on numpad button '" + num + "'",
            trigger: ".input-button.number-char:contains('"+num+"')"
        }
    }

    var steps = [{
        content: 'waiting for loading to finish',
        trigger: '.o_main_content:has(.loader:hidden)',
        run: function () {}
    }, {
        content: "click container button",
        trigger: ".control-button.o_container_button",
    }, {
        content: "select a container",
        trigger: ".container-line:contains('Container 1')",
    }, {
        content: "confirm selection",
        trigger: ".containerlist-screen .next",
    }, {
        content: "Container should be present in the orderlines",
        trigger: ".orderline.selected:contains('Container without product')",
        run: function () {}, // it's a check
    }, {
        content: "select product",
        trigger: ".product:contains('Whiteboard Pen')", //UoM = kg
    }, {
        content: "validate weight",
        trigger: ".buy-product",
    }, {
        content: "Orderline should be in AUTO tare mode",
        trigger: ".orderline.selected:contains('AUTO')",
        run: function () {}, // it's a check
    }, {
        content: "Orderline should have the Pen as product",
        trigger: ".orderline.selected .product-name:contains('Whiteboard Pen')",
        run: function () {}, // it's a check
    }, {
        content: "Orderline should have the Container shown",
        trigger: ".orderline.selected .info:contains('Container 1')",
        run: function () {}, // it's a check
    }, {
        content: "Orderline should have the tared weight as quantity",
        trigger: ".orderline.selected .info:contains('-0.123')",
        run: function () {}, // it's a check
    }, {
        content: "select product again", // defaults to 1kg
        trigger: ".product:contains('Whiteboard Pen')", //UoM = kg
    }, {
        content: "switch numpad to tare mode",
        trigger: ".control-button.o_tare_button",
    },
    click_numpad(0),
    click_numpad('.'),
    click_numpad(6),
    {
        content: "Orderline should be in MAN tare mode",
        trigger: ".orderline.selected:contains('MAN')",
        run: function () {}, // it's a check
    }, {
        content: "Orderline should have the tared weight as quantity",
        trigger: ".orderline.selected .info:contains('0.4')",
        run: function () {}, // it's a check
    }];

    Tour.register('pos_container', { test: true, url: '/pos/web' }, steps);
});
