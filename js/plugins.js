import Routing from '@js/plugins/Routing';
import productPlugins from '@mapstore/product/plugins.js';

export default {
    requires: {
        ...productPlugins.requires
    },
    plugins: {
        ...productPlugins.plugins,
        Routing
    }
};