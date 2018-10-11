Ext.define('Utils.AncestorPiInlineFilter', {
    override: 'Rally.ui.inlinefilter.QuickFilterPanel',
    portfolioItemTypes: [],
    modelName: undefined,
    customFilterNamePrefix: "AncestorPiInlineFilter.",

    _hasPiAncestor: function(modelName) {
        return _.contains(['hierarchicalrequirement', 'userstory', 'defect'], modelName) || modelName.startsWith('portfolioitem');
    },

    _pisAbove: function(modelName) {
        var result = [];
        if (_.contains(['hierarchicalrequirement', 'userstory', 'defect'], modelName)) {
            result = this.portfolioItemTypes
        }
        else if (modelName.startsWith('portfolioitem')) {
            var startIndex = _.findIndex(this.portfolioItemTypes, function(piType) {
                return piType.get('TypePath').toLowerCase() === modelName;
            });
            if (startIndex >= 0 && startIndex < this.portfolioItemTypes.length - 1) {
                result = this.portfolioItemTypes.slice(startIndex + 1);
            }
        }
        return result;
    },

    initComponent: function() {
        if (this.modelName) {
            this.modelName = this.modelName.toLowerCase();
        }
        var filterFactoryOverrides = {};
        var additionalFields = []
        if (this._hasPiAncestor(this.modelName)) {
            var pisAbove = this._pisAbove(this.modelName);
            _.each(pisAbove, function(piType) {
                var typePath = piType.get('TypePath');
                var customFilterName = this.customFilterNamePrefix + typePath;
                var displayName = 'Portfolio Item / ' + piType.get('Name');

                filterFactoryOverrides[customFilterName] = {
                    xtype: 'ancestorpisearchcombobox',
                    portfolioItemType: typePath, // The artifact type to search for
                    piTypesAbove: pisAbove, // List of portfolio item types
                    artifactTypeName: this.modelName, // The artifact type we are filtering
                    storeConfig: {
                        models: typePath,
                        autoLoad: true
                    },
                    allowNoEntry: true,
                    noEntryValue: null,
                    noEntryText: 'No ' + displayName,
                    emptyText: 'Search ' + displayName + 's...',
                    allowClear: false,
                    valueField: 'ObjectUUID' // Must use ObjectUUID to align with the state that is saved by inlinefilterbutton
                };
                additionalFields.push({
                    name: customFilterName,
                    displayName: displayName
                })
            }, this);

            // Add the additional fields to the quick filter config
            _.merge(this.addQuickFilterConfig, {
                additionalFields: additionalFields
            }, function(a, b) {
                if (_.isArray(a)) {
                    return a.concat(b)
                }
            });

            // Add the corresponding items to the FilterFieldFactory
            Ext.override(Rally.ui.inlinefilter.FilterFieldFactory, filterFactoryOverrides);
        }

        this.callParent(arguments);
    },

    // Must strip out these synthetic fields if the modelName has changed from one of the ones we know
    // how to filter
    _createFields: function() {
        if (!this._hasPiAncestor(this.modelName)) {
            // Strip out the custom filters from this.fields and this.initialFilters
            this.fields = _.filter(this.fields, function(field) {
                return !Ext.String.startsWith(field, this.customFilterNamePrefix);
            }, this);
            this.initialFilters = _.filter(this.initialFilters, function(filter) {
                return !Ext.String.startsWith(filter.name, this.customFilterNamePrefix);
            }, this);
        }
        this.callParent(arguments);
    }
});

Ext.define('Utils.AncestorPiSearchComboBox', {
    alias: 'widget.ancestorpisearchcombobox',
    extend: 'Rally.ui.combobox.ArtifactSearchComboBox',

    parentField: 'PortfolioItem.Parent.',

    artifactTypeName: undefined, // The name of the model that will be filtered
    piTypesAbove: [],

    initComponent: function() {
        // Compensate for parent constructor assuming that filter value is OidFromRef
        this.storeConfig.filters = [{
            property: this.valueField,
            value: this.value
        }];
        this.storeConfig.filters = [];
        this.callParent(arguments);
    },

    getFilter: function() {

        var record = this.getRecord();
        var propertyPrefix = this.propertyPrefix();
        var filters = []
        if (record) {
            filters.push({
                property: propertyPrefix + ".ObjectUUID",
                value: record.get('ObjectUUID')
            });
        }
        else {
            filters.push({
                property: propertyPrefix,
                value: null
            });
        }
        return Rally.data.wsapi.Filter.or(filters);
    },

    propertyPrefix: function() {
        var property;
        // Get the path between the selected artifact and the lowest level PI above it
        if (this.artifactTypeName === 'hierarchicalrequirement' || this.artifactTypeName === 'userstory') {
            property = this.piTypesAbove[0].get('Name');
        }
        else if (this.artifactTypeName === 'defect') {
            property = 'Requirement.' + this.piTypesAbove[0].get('Name');
        }
        else if (this.artifactTypeName.startsWith('portfolioitem')) {
            property = 'Parent';
        }

        if (property) {
            // Now add .Parent for every PI level above the lowest until we get to the
            // desired PI type
            _.forEach(this.piTypesAbove, function(piType) {
                if (piType.get('TypePath').toLowerCase() == this.portfolioItemType.toLowerCase()) {
                    return false;
                }
                else {
                    property = property + '.Parent'
                }
            }, this);
        }

        return property;
    }
});
