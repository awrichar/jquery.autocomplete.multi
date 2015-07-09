/**
 * jQuery Autocomplete extension for multi-selection
 * @author Andrew Richardson
 */
(function($){
    var KEY = {
        BACKSPACE: 8,
        LEFT: 37,
        RIGHT: 39,
        DELETE: 46
    },
    NORESULTS = "NORESULTS",
    ADDNEW = "ADDNEW";

    /**
     * Multi-select Autocomplete Box
     *
     * Methods:
     *   add(item)
     *   remove(bit)
     *   removeAll()
     *   clearInput()
     *   focusBit(bit)
     */
    $.widget("ui.autocomplete_multi", {
        options: {
            // Standard autocomplete options
            autoFocus: true,
            minLength: 1,
            delay: 400,

            // Custom options
            excludeDuplicates: true,
            sortable: false,
            title: "",
            inputWidth: 50,
            noResultsText: "No results",
            addNewText: "Add new...",
            maxItems: null,

            // Standard autocomplete callbacks
            focus: function(){ return false; },

            // Custom callbacks
            // (default behavior for each of these is defined below)
            renderItem: null,
            addNew: null
        },

        _create: function() {
            var self = this, o = self.options, el = self.element,
                choices, initialVal;

            // Hide the existing form element and save its name
            self.name = el.attr('name');
            el.removeAttr('name').hide();
            el.data("autocomplete_multi", self);

            if(el.is(':input')) {
                choices = {};
                initialVal = [];

                // If using a select box and no custom source was provided, read
                // in the options to use as source data
                if(el.is('select')) {
                    el.find('option').each(function(){
                        var opt = $(this),
                            value = opt.val();
                        choices[value] = {
                            value: value,
                            label: opt.html()
                        };

                        if(value && opt.is(':selected')) {
                            initialVal.push(value);
                        }
                    });

                    if(!o.source) {
                        o.source = [];
                        for(var id in choices) o.source.push(choices[id]);
                    }
                }

                // If using a text input, try to parse the initial value as JSON
                else {
                    try {
                        var json = $.parseJSON(el.val());
                        for(var i=0; i<json.length; i++) {
                            initialVal.push(json[i].value);
                            choices[json[i].value] = json[i];
                        }
                    } catch(e) {
                    }
                }
            }

            // Create all the necessary elements
            self.wrapper = $("<ul class='ui-autocomplete-multi'/>");
            self.input = $("<input type='text'/>").width(o.inputWidth);
            self.loading = $("<li class='ui-autocomplete-multi-loading'/>");
            self.bit = $("<li class='ui-autocomplete-multi-bit'/>")
                .append("<span class='ui-icon ui-icon-close'/>")
                .append("<span class='ui-autocomplete-multi-bit-text'/>");
            self.inputBit = $("<li class='ui-autocomplete-multi-input-bit'/>");

            el.focus(function(){ self.input.focus(); });

            // Pull in default callbacks
            if(!o.renderItem) o.renderItem = self._renderItem;

            // search callback (show the loading graphic when searching)
            var custom_search = o.search ? o.search : null;
            o.search = function(event, ui) {
                self.loading.show();
                if(custom_search) return custom_search(event, ui);
            };

            // Default select callback (can be overridden)
            var customSelect = o.select || function(event, ui){
                if(self.add(ui.item)) {
                    self.input.val("");
                }
            };
            o.select = function(event, ui) {
                if(ui.item.value == ADDNEW) {
                    // Fire the addNew() callback
                    o.addNew(self.input.val(), function(item){
                        ui.item = item;
                        customSelect.call(el, event, ui);
                    });
                } else {
                    // By default, just add the new item
                    customSelect.call(el, event, ui);
                }
                return false;
            }

            // Format the control
            self.wrapper
                .insertAfter(el)
                .append(self.loading.hide())
                .append(self.inputBit.append(self.input))
                .append("<li style='display: block; clear: both;'/>")
                .click(function(){ self.focusBit(null); self.input.focus(); });

            // Position the autocomplete results
            o.appendTo = self.wrapper;
            o.position = {my: "left top", at: "left bottom", of: self.wrapper};

            // Initialize autocomplete box
            self.input.autocomplete(o);
            var autocomplete = self.input.data("ui-autocomplete");
            self._replaceSourceCallback();

            // keypress callbacks
            self.wrapper.keydown(function(event){
                self._keyDown(event);
            });
            self.input.keydown(function(event){
                self._keyDownInput(event);
            });

            // Apply the custom item rendering
            autocomplete._renderItem = function(ul, item) {
                var li;
                if(item.value == NORESULTS) {
                    // Bypass custom rendering for the "No results" item
                    li = self._renderItem(item);
                    li.addClass("ui-autocomplete-multi-noresults");
                } else if(item.value == ADDNEW) {
                    // Bypass custom rendering for the "Add new" item
                    li = self._renderItem(item);
                    li.addClass("ui-autocomplete-multi-addnew");
                } else {
                    li = o.renderItem.call(self, item);
                }
                ul.append(li);
                return li;
            };

            // Insert initial values
            if(choices && initialVal) {
                for(var i=0; i<initialVal.length; i++) {
                    self.add(choices[initialVal[i]]);
                }
            }

            // Initialize sorting
            if(o.sortable) {
                self.wrapper.sortable({ items: '.ui-autocomplete-multi-bit' });
            }

            // Show hint text
            if(o.title) {
                self.input.attr('title', o.title).hint();
            }
        },

        // Return the control to normal
        destroy: function() {
            this.wrapper.remove();
            this.element.show();
        },

        // Get/set options
        option: function(name, value) {
            this.input.autocomplete('option', name, value);

            if(name == "source") {
                this._replaceSourceCallback();
            }
        },

        // Add an item to the box
        add: function(item) {
            var self = this, o = self.options;

            // Check for the "no results" item
            if(item.value == NORESULTS) return false;

            // Make sure the item doesn't already exist
            if(o.excludeDuplicates) {
                self._getBits().each(function(){
                    var item2 = $(this).data('autocomplete-item');
                    if(item.value == item2.value) {
                        self.remove(this);
                    }
                });
            }

            // Make sure not to go over the max
            if(o.maxItems) {
                bitCount = self._getBits().length;
                if(bitCount >= o.maxItems) return false;
                else if(bitCount == o.maxItems - 1) self.inputBit.hide();
            }

            // Insert a bit for the selected item
            self.bit.clone()
                .insertBefore(self.inputBit)
                .data('autocomplete-item', item)
                .click(function(event){
                    self.focusBit(this);
                    self.input.focus();
                    event.stopPropagation();
                })
                .children('.ui-autocomplete-multi-bit-text')
                    .html(item.label)
                    .end()
                .children('.ui-icon-close').click(function(){
                    self.remove($(this).parent());
                }).end()
                .append(
                    $('<input type="hidden" />')
                        .attr('name', self.name)
                        .val(item.value)
                );

            self.focusBit(null);
            return true;
        },

        // Remove a bit from the box
        remove: function(bit) {
            var self = this;
            bit = $(bit);

            if(bit.hasClass('ui-state-focus')) {
                var newFocus = bit.prev();
                if(!newFocus.length) newFocus = bit.next();
                self.focusBit(newFocus);
            }
            bit.remove();
            self.inputBit.show();
        },

        // Remove all bits from the box
        removeAll: function() {
            this._getBits().remove();
            this.inputBit.show();
        },

        clearInput: function() {
            this.input.val('');
        },

        // Select the indicated bit
        focusBit: function(bit) {
            var self = this, bits = self._getBits();
            bit = $(bit);

            bits.removeClass('ui-state-focus');
            if(bit.length > 0 && bit[0] != self.inputBit[0]) {
                bit.addClass('ui-state-focus');
            }
        },

        // Add on to the user-defined source callback
        _replaceSourceCallback: function() {
            var self = this,
                autocomplete = self.input.data("ui-autocomplete"),
                sourceCallback = autocomplete.source,
                o = self.options;

            autocomplete.source = function(request, response) {
                sourceCallback(request, function(data){
                    // Hide the loading graphic when search completes
                    self.loading.hide();

                    if(!data) data = [];
                    if(o.addNew) {
                        // Insert the the "Add new" item
                        data.push({ label: o.addNewText, value: ADDNEW });
                    } else if(data.length == 0) {
                        // Insert the "No results" text
                        data.push({ label: o.noResultsText, value: NORESULTS });
                    }

                    response(data);
                });
            };
        },

        // Get all bits currently added
        _getBits: function() {
            return this.wrapper.children('.ui-autocomplete-multi-bit');
        },

        // Render an item in the results list (can be overridden)
        _renderItem: function(item) {
            return $("<li/>")
                .data("item.autocomplete", item)
                .append(item.label)
                .wrapInner("<a/>");
        },

        // Handle keypresses in the input box
        _keyDownInput: function(event) {
            // Unless the box is empty, stop keys from propagating upwards
            var self = this, val = self.input.val();
            if(val != "") event.stopPropagation();
        },

        // Handle keypresses
        _keyDown: function(event) {
            var self = this, curBit = self.wrapper.children('.ui-state-focus');

            switch(event.keyCode) {
            case KEY.BACKSPACE:
                // Backspace - move backward and delete bits
                if(curBit.length) self.remove(curBit);
                else {
                    self.focusBit(self.inputBit.prev());
                    event.preventDefault();
                }
                break;

            case KEY.DELETE:
                // Delete - delete bits
                if(curBit.length) self.remove(curBit);
                break;

            case KEY.LEFT:
                // Left - select previous bit
                if(!curBit.length) self.focusBit(self.inputBit.prev());
                else self.focusBit(curBit.prev());
                break;

            case KEY.RIGHT:
                // Right - select next bit
                if(!curBit.length) self.focusBit(self._getBits().eq(0));
                else self.focusBit(curBit.next());
                break;
            }
        }
    });
})(jQuery);