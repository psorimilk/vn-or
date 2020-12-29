'use strict';
var REQUIRED_FIELDS = ['phone', 'name', 'address', 'postal_code', 'prefecture', 'city'],
    SEND_URL = '/order/create_temporary/',
    NO_AUTOSAVE_FIELD = 'no_autosave_orders',
    TIMEOUT_PERIOD = 3000,
    sender = function () {
            saver.data.forEach(function (form_element) {
                var is_valid = true;
                for (var key in form_element.required) {
                    if(form_element.required.hasOwnProperty(key) && !form_element.required[key].is_valid) {
                        is_valid = false;
                        break
                    } else {
                        form_element.form[key] = form_element.required[key].value
                    }
                }
                if (is_valid) {
                    console.log('new request');
                    $.post(SEND_URL, form_element.form, function (data) {
                        if (data.status !== 'ok')
                            console.log('Error during creating temporary order, error: ' + data.message)
                    }, 'json')
                }
            })
    },
    timeout = function () {
            var timeoutHandler,
                resetTimeout = function () {
                    clearTimeout(timeoutHandler);
                    timeoutHandler = setTimeout(sender, TIMEOUT_PERIOD);
                };
            return function () {
                resetTimeout()
            }
    },
    timeoutResetter = timeout(),
    saver = {
        data: [],
        listener: function (event) {
            var element = event.target;
            saver.data.forEach(function (form_entity, i) {
              	if(form_entity.required[element.name]){
                  	if (form_entity.required[element.name].value !== element.value && element.value !== form_entity.required[element.name].placeholder) {
                    	saver.data[i].required[element.name].value = element.value;
                    	saver.data[i].required[element.name].is_valid = true;
                    	timeoutResetter()
                	}
                }
                
            })
        },
        init: function () {
            var form = $('form');
            if (form.length) {
                for (var i = 0; i < form.length; i++) {
                    var cur_form = form[i],
                        form_fields = {form: {}, required: {}};
                    for (var k = 0; k < cur_form.elements.length; k++){
                        var el = cur_form.elements[k];
                      	if (el.name === NO_AUTOSAVE_FIELD && el.value == 1)
                          return
                        form_fields.form[el.name] = el.value
                    }

                    form_fields.form.user_agent = navigator.userAgent;

                    REQUIRED_FIELDS.forEach(function (fieldname) {
                        var field = cur_form.elements[fieldname];
                        if (field !== undefined && field.style.display !== 'none' && field.type !== 'hidden') {
                            $(field).on('keyup', saver.listener);
                            form_fields.required[fieldname] = {
                                value: field.value,
                                is_valid: false,
                                placeholder: field.attributes.placeholder !== 'undefined' ? '' : field.attributes.placeholder.value
                            }
                        }
                    });
                    form_fields.user_agent = navigator.userAgent;
                    saver.data.push(form_fields)
                }
            }
        }
    };
$(document).ready(function(){
    saver.init();
});
