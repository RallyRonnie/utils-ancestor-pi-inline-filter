Ext.define('Utils.AncestorPiInlineFilter', {
    override: 'Rally.ui.inlinefilter.QuickFilterPanel',
    portfolioItemTypes: [],
    modelName: undefined,
    customFilterNamePrefix: "AncestorPiInlineFilter.",
    initComponent: function() {
        var filterFactoryOverrides = {};
        var additionalFields = []
        if ( _.contains(['HierarchicalRequirement', 'UserStory', 'Defect'], this.modelName) ) {
            _.each(this.portfolioItemTypes, function(piType) {
                var typePath = piType.get('TypePath');
                var customFilterName = this.customFilterNamePrefix + typePath;
                var displayName = 'Portfolio Item / ' + piType.get('Name');
    
                filterFactoryOverrides[customFilterName] = {
                       xtype: 'ancestorpisearchcombobox',
                       portfolioItemType: typePath, // The artifact type to search for
                       portfolioItemTypes: this.portfolioItemTypes,  // List of portfolio item types
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
                        valueField: 'ObjectUUID'    // Must use ObjectUUID to align with the state that is saved by inlinefilterbutton
                };
                additionalFields.push({
                  name: customFilterName,
                  displayName: displayName
                })
           }, this);
           
           // Add the additional fields to the quick filter config
            _.merge(this.addQuickFilterConfig, {
                    additionalFields: additionalFields
            }, function(a,b) {
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
        if ( !_.contains(['HierarchicalRequirement', 'UserStory', 'Defect'], this.modelName) ) {
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
    portfolioItemTypes: [],
    
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
        
        var value = this.lastValue;
        var propertyPrefix = this.propertyPrefix();
        var filters = []
        if (value) {
            filters.push({
                property: propertyPrefix + ".ObjectUUID",
                value: value
            });
        } else {
            filters.push({
                property: propertyPrefix,
                value: null
            });
        }
        return Rally.data.wsapi.Filter.or(filters);
    },
    
    propertyPrefix: function() {
       var property;
       switch(this.artifactTypeName) {
           case 'HierarchicalRequirement':
               property = 'PortfolioItem';
               break;
            case 'Defect':
                property = 'Requirement.PortfolioItem';
                break;
       }
       
       if ( property ) {
           _.forEach(this.portfolioItemTypes, function(piType) {
               if ( piType.get('TypePath') == this.portfolioItemType ) {
                   return false;
               } else {
                   property = property + '.Parent'
               }
           }, this);
       }
       
       return property;
   }
});