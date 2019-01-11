/* globals Rally */
// Fix the PreliminaryEstimate renderer to sort by value
Rally.ui.renderer.GridEditorFactory.editorRenderers['PreliminaryEstimate'] = function(field) {
    return {
        xtype: 'rallyrecordcontexteditor',
        field: {
            xtype: 'rallycombobox',
            allowNoEntry: !field.required,
            editable: false,
            name: field.name,
            storeConfig: {
                autoLoad: true,
                model: field.name,
                remoteFilter: true,
                sorters: [{
                    property: "Value"
                }],
                listeners: {
                    load: function() {
                        return;
                    }
                }
            }
        }
    };
};

Ext.define('Utils.AncestorPiInlineFilter', {
    override: 'Rally.ui.inlinefilter.QuickFilterPanel',
    portfolioItemTypes: [],
    modelName: undefined,
    customFilterNamePrefix: "AncestorPiInlineFilter.",

    _hasPiAncestor: function(modelName) {
        return _.contains(['hierarchicalrequirement', 'userstory', 'defect'], modelName) || Ext.String.startsWith(modelName, 'portfolioitem');
    },

    _pisAbove: function(modelName) {
        var result = [];
        if (_.contains(['hierarchicalrequirement', 'userstory', 'defect'], modelName)) {
            result = this.portfolioItemTypes
        }
        else if (Ext.String.startsWith(modelName, 'portfolioitem')) {
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
        if (!this.dataContext) {
            this.dataContext = Rally.getApp().getContext().getDataContext();
        }

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
                        context: this.dataContext,
                        models: typePath,
                        autoLoad: true
                    },
                    allowNoEntry: true,
                    noEntryValue: null,
                    noEntryText: 'No ' + displayName,
                    emptyText: 'Search ' + displayName + 's...',
                    allowClear: false,
                    valueField: 'ObjectUUID', // Must use ObjectUUID to align with the state that is saved by inlinefilterbutton
                    forceSelection: false
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
                    return _.uniq(a.concat(b), 'name') // Strip duplicates by name that can occur from state
                }
            });

            // Add the corresponding items to the FilterFieldFactory
            Ext.override(Rally.ui.inlinefilter.FilterFieldFactory, filterFactoryOverrides);
        }

        this.callParent(arguments);
    },

    _createFields: function() {
        // Strip out the custom filters from this.fields and this.initialFilters
        this.fields = _.filter(this.fields, function(field) {
            return this._filterInvalidAncestorFilters(field);
        }, this);
        this.initialFilters = _.filter(this.initialFilters, function(filter) {
            return this._filterInvalidAncestorFilters(filter.name);
        }, this);
        this.callParent(arguments);
    },

    /**
     * This will exclude any field restored from state that we didn't explicitly add into the Factory
     * for the current model type. This prevents changes in model types from trying to build an invalid filter
     * for that new model type.
     */
    _filterInvalidAncestorFilters: function(name) {
        return !Ext.String.startsWith(name, this.customFilterNamePrefix) || Rally.ui.inlinefilter.FilterFieldFactory.hasOwnProperty(name)
    }
});

Ext.define('Utils.AncestorPiSearchComboBox', {
    alias: 'widget.ancestorpisearchcombobox',
    extend: 'Rally.ui.combobox.ArtifactSearchComboBox',

    parentField: 'PortfolioItem.Parent.',

    artifactTypeName: undefined, // The name of the model that will be filtered
    piTypesAbove: [],
    statics: {
        UUID_REGEX: /([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/
    },

    constructor: function(config) {
        if (config.value) {
            Ext.merge(config, {
                storeConfig: {
                    filters: Rally.data.wsapi.Filter.or([{
                            property: config.valueField, // Compensate for parent constructor assuming that filter value is OidFromRef
                            value: config.value
                        }
                        /*, {
                                                property: 'ObjectID',
                                                operator: '!=',
                                                value: 0
                                            }*/
                    ])
                }
            });
        }

        //this.callSuper(arguments);
        // Get super super method (skip the extended ArtifactSearchComboBox.constructor()
        return this.superclass.superclass['constructor'].apply(this, arguments);
    },

    initComponent: function() {
        this.on('change', function(cmp, newValue, oldValue) {
            if (newValue == "") {
                this.store.load({
                    filters: []
                })
            }
        }, this)
        return this.callParent(arguments);
    },

    setValue: function() {
        this.callParent(arguments);
    },

    getFilter: function() {

        var value = this.lastValue;
        var propertyPrefix = this.propertyPrefix();
        var filters = []
        // If the value is a UUID, then use it, otherwise ignore values the user might be typing in
        if (value && this.statics().UUID_REGEX.test(value)) {
            filters.push({
                property: propertyPrefix + ".ObjectUUID",
                value: value
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
        else if (Ext.String.startsWith(this.artifactTypeName, 'portfolioitem')) {
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
