odoo.define('weighing_point.main', function (require) {
    "use strict";

    var chrome = require('weighing_point.chrome');
    var core = require('web.core');

    core.action_registry.add('wp.ui', chrome.Chrome);

});
