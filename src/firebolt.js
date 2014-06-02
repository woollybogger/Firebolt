﻿/**
 * Firebolt current core file.
 * @version 0.4.0
 * @author Nathan Woltman
 * @copyright 2014 Nathan Woltman
 * @license MIT https://github.com/FireboltJS/Firebolt/blob/master/LICENSE.txt
 */

(function(window, document) {
	'use strict';

//#region =========================== Private ================================

/*
 * Local variables that are compressed when this file is minified.
 */
var prototype = 'prototype',
	ArrayPrototype = Array[prototype],
	ElementPrototype = Element[prototype],
	HTMLElementPrototype = HTMLElement[prototype],
	NodePrototype = Node[prototype],
	NodeListPrototype = NodeList[prototype],
	HTMLCollectionPrototype = HTMLCollection[prototype],
	StringPrototype = String[prototype],
	Object = window.Object,
	defineProperty = Object.defineProperty,
	defineProperties = Object.defineProperties,
	getOwnPropertyNames = Object.getOwnPropertyNames,
	arrayFilter = ArrayPrototype.filter,
	encodeURIComponent = window.encodeURIComponent,

	//Property strings
	insertAdjacentHTML = 'insertAdjacentHTML',

	//Data variables
	dataKeyPublic = ('FB' + 1 / Math.random()).replace('.', ''),
	dataKeyPrivate = ('FB' + 1 / Math.random()).replace('.', ''),
	rgxNoParse = /^\d+\D/, //Don't try to parse strings that look like numbers but have non-digit characters

	//Need this (unfortunately) to choose how to define the Firebolt function
	isIE = /*@cc_on!@*/false || !!document.documentMode,
	Firebolt,

	/* Pre-built RegExps */
	rgxGetOrHead = /GET|HEAD/i, //Determines if a request is a GET or HEAD request
	rgxDomain = /\/?\/\/(?:\w+\.)?(.*?)(?:\/|$)/,
	rgxDifferentNL = /^(?:af|ap|be|ins|pre|pu|tog)|remove(?:Class)?$/, //Determines if the function is different for NodeLists
	rgxClassOrId = /^.[\w_-]+$/,
	rgxTag = /^[A-Za-z]+$/,
	rgxNonWhitespace = /\S+/g,
	rgxSpaceChars = /[ \n\r\t\f]+/, //From W3C http://www.w3.org/TR/html5/single-page.html#space-character
	
	/* AJAX */
	timestamp = Date.now(),
	oldCallbacks = [],
	ajaxSettings = {
		accept: {
			'*': '*/*',
			html: 'text/html',
			json: 'application/json, text/javascript',
			script: 'text/javascript, application/javascript, application/ecmascript, application/x-ecmascript',
			text: 'text/plain',
			xml: 'application/xml, text/xml'
		},
		async: true,
		contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
		isLocal: /^(?:file|.*-extension|widget):\/\//.test(location.href),
		jsonp: 'callback',
		jsonpCallback: function() {
			var callback = oldCallbacks.pop() || dataKeyPublic + "_" + (timestamp++);
			this[callback] = true;
			return callback;
		},
		type: 'GET',
		url: location.href,
		xhr: XMLHttpRequest
	};

/** 
 * Calls the function with the passed in name on each element in an enumerable.
 * 
 * @private
 * @param {String} funcName - The name of a function.
 * @returns {Array|NodeList|HTMLCollection} A reference to the enumerable
 * @this An enumerable such as an Array, NodeList, or HTMLCollection.
 */
function callOnEachElement(funcName) {
	return function() {
		for (var i = 0, len = this.length; i < len; i++) {
			if (this[i].nodeType === 1) this[i][funcName].apply(this[i], arguments);
		}
		return this;
	};
}

/*
 * @see Firebolt.create
 */
function createElement(tagName, attributes) {
	var el = document.createElement(tagName);
	return attributes ? el.attr(attributes) : el;
}

/**
 * Creates a new DocumentFragment and (optionally) appends the passed in content to it.
 * 
 * @private
 * @param {ArgumentsList} [content] - List of content to append to the new DocumentFragment.
 * @returns {DocumentFragment} The new fragment.
 */
function createFragment(content) {
	var fragment = document.createDocumentFragment(),
		i = 0,
		item;

	for (; i < content.length; i++) {
		item = content[i];
		if (item instanceof Node) {
			fragment.appendChild(item);
		}
		else {
			if (typeofString(item)) {
				item = htmlToNodes(item);
			}
			var origLen = item.length,
				j = 1;
			if (origLen) {
				fragment.appendChild(item[0]);
				if (item.length < origLen) { //item is a live NodeList/HTMLCollection
					for (; j < origLen; j++) {
						fragment.appendChild(item[0]);
					}
				}
				else { //item is a static collection of nodes
					for (; j < origLen; j++) {
						fragment.appendChild(item[j]);
					}
				}
			}
		}
	}

	return fragment;
}

/**
 * Having this function allows for code reuse when storing private vs. user-accessible data.
 * @private
 * @param {String} dataStore - The key to the stored data object.
 * @param {Object} obj - The object to store arbitrary data on.
 * @see HTMLElement#data
 */
function data(dataStore, obj, key, value) {
	var dataObject = obj[dataStore],
		isElement = obj instanceof Element,
		dataAttributes,
		attributes,
		i;

	if (!dataObject) {
		//Define a non-enumerable object
		defineProperty(obj, dataStore, {
			writable: true, //So that the data can easily be cleared by .removeData()
			value: dataObject = {}
		});

		//If this is an Element, try loading "data-*" attributes
		if (isElement) {
			var attrib, val;

			dataAttributes = {};
			attributes = obj.attributes;

			for (i = 0; i < attributes.length; i++) {
				attrib = attributes[i];
				if (attrib.name.startsWith('data-')) {
					if (!rgxNoParse.test(val = attrib.value)) {
						//Try to parse the value
						try {
							val = JSON.parse(val);
						}
						catch (e) { }
					}
					//Set the value in the data object (remembering to remove the "data-" part from the name)
					dataAttributes[attrib.name.slice(5)] = val;
				}
			}

			//Save the data privately if there is any
			if (!isEmptyObject(dataAttributes)) {
				dataPrivate(obj, 'data-attrs', dataAttributes);
			}
		}
	}

	/* This may look confusing but it's really saving space (as in the amount of code in the file).
	 * What's happening is that `dataAttributes` is getting set to itself (if it was created above)
	 * or it is set to the private data and is then checked to see if it is an empty object. */
	if (isElement && !isEmptyObject(dataAttributes = dataAttributes || dataPrivate(obj, 'data-attrs'))) {
		//Find the attributes the data object does not already have from the data attributes
		//and add them to the data object
		attributes = ArrayPrototype.remove.apply(Object.keys(dataAttributes), Object.keys(dataObject));
		for (i = 0; i < attributes.length; i++) {
			dataObject[attributes[i]] = dataAttributes[attributes[i]];
		}
	}

	if (isUndefined(value)) {
		if (typeof key == 'object') {
			extend(dataObject, key); //Set multiple
		}
		else {
			return isUndefined(key) ? dataObject : dataObject[key]; //Get data object or value
		}
	}
	else {
		dataObject[key] = value; //Set value
	}
	
	return obj;
}

/* For saving data for internal use */
function dataPrivate(obj, key, value) {
	//The internal data is actually saved to the public data object
	return data(dataKeyPrivate, obj[dataKeyPublic] || data(dataKeyPublic, obj), key, value);
}

/*
 * @see Firebolt.extend
 */
function extend(target) {
	var numArgs = arguments.length,
		i = 1,
		key;

	if (numArgs > 1) {
		//Extend the target object
		for (; i < numArgs; i++) {
			for (key in arguments[i]) {
				target[key] = arguments[i][key];
			}
		}
		return target;
	}

	//Extend the Firebolt objects
	extend(NodeCollectionPrototype, target);
	extend(NodeListPrototype, target);
	extend(HTMLCollectionPrototype, target);
}

/*
 * Returns the status text string for AJAX requests.
 */
function getAjaxErrorStatus(xhr) {
	return xhr.statusText.replace(xhr.status + ' ', '');
}

/** 
 * Returns a function that calls the function with the passed in name on each element in an enumerable unless
 * the callback returns true, in which case the result of calling the function on the first element is returned.
 * 
 * @private
 * @param {String} funcName - The name of a function.
 * @param {Function} callback(numArgs, firstArg) - Function to determine if the value of the first element should be returned.
 * @this An enumerable such as a NodeCollection.
 */
function getFirstSetEachElement(funcName, callback) {
	return function(firstArg) {
		var items = this,
			len = items.length,
			i = 0;

		if (!callback(arguments.length, firstArg)) {
			//Set each
			for (; i < len; i++) {
				if (items[i].nodeType === 1) {
					items[i][funcName].apply(items[i], arguments);
				}
			}
			return items;
		}

		//Get first
		for (; i < len; i++) {
			if (items[i].nodeType === 1) {
				return items[i][funcName](firstArg); //Only need first arg for getting
			}
		}
	};
}

/* 
 * Returns the function body for Node#[putAfter, putBefore, or prependTo]
 * 
 * @param {Function} insertingCallback(newNode, refNode) - The callback that performs the insertion.
 */
function getNodeInsertingFunction(insertingCallback) {
	return function(target) {
		if (typeofString(target)) {
			target = Firebolt(target);
		}
		else if (target instanceof Node) {
			insertingCallback(this, target);
			return this;
		}

		var i = target.length;
		if (i--) {
			for (; i > 0; i--) {
				insertingCallback(this.cloneNode(true), target[i]);
			}
			insertingCallback(this, target[0]);
		}

		return this;
	}
}

/* Returns the function body for NodeCollection#[putAfter, putBefore, appendTo, or prependTo] */
function getPutOrToFunction(funcName) {
	return function(target) {
		(typeofString(target) ? Firebolt(target) : target)[funcName](this);

		return this;
	}
}

/*
 * Takes an HTML string and returns a NodeList created by the HTML.
 */
function htmlToNodes(html) {
	return createElement('div').html(html).childNodes;
}

/*
 * Function for inserting a node after a reference node.
 */
function insertAfter(newNode, refNode) {
	refNode.parentNode.insertBefore(newNode, refNode.nextSibling);
}

/*
 * Function for inserting a node before a reference node.
 */
function insertBefore(newNode, refNode) {
	refNode.parentNode.insertBefore(newNode, refNode);
}

/*
 * @see Firebolt.isPlainObject
 */
function isPlainObject(obj) {
	return Object[prototype].toString.call(obj) == '[object Object]';
}

/*
 * @see Firebolt.isEmptyObject
 */
function isEmptyObject(object) {
	for (var item in object) {
		return false;
	}
	return true;
}

/*
 * Specifically for the Firebolt selector.
 * Determines if the input is actually an HTML string instead of a CSS selector.
 * 
 * Rationale:
 * 
 * The string can only be considered HTML if it contains the tag open character: '<'.
 * Normally, this character should never appear in a CSS selector, however it is possible
 * for an element to have an attribute with a value that contains the '<' character.
 * Here's an example:
 * 
 * <div data-notcool="<tag>"></div>
 * 
 * Hence, this element should be able to be selected with the following CSS selector:
 * 
 * [data-notcool="<tag>"]
 * 
 * So for the string to truly be HTML, not only must it contain the '<' character, but
 * the first instance of that character must also be found in the string before any
 * instance of the '[' character.
 * 
 * The reason the '[' character is not searched for if the index of the '<' character is
 * less that 4 is because the smallest possible CSS selector that contains '<' is this:
 * 
 * [d="<"]
 * 
 * This also means that if '<' is found in the string, we only need to start searching for
 * a '[' beginning at the index 4 less than the index the fist '<' was found at. 
 * 
 * @param {String} str
 * @returns 1 if the string is deemed to be an HTML string; else 0.
 */
function isHtml(str) {
	var idxTag = str.indexOf('<');
	if (idxTag >= 0 && (idxTag < 4 || str.lastIndexOf('[', idxTag - 4) < 0)) {
		return 1;
	}
	return 0;
}

function isUndefined(value) {
	return value === undefined;
}

/*
 * Prepends a node to a reference node. 
 */
function prepend(newNode, refNode) {
	refNode.insertBefore(newNode, refNode.firstChild);
}

function typeofString(value) {
	return typeof value == 'string';
}

//#endregion Private


//#region ============================ Array =================================

/**
 * @class Array
 * @classdesc The JavaScript Array object.
 * @mixes Object
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array|Array - JavaScript | MDN}
 */

defineProperties(ArrayPrototype, {
	/* Private reference to the constructor */
	__C__: {
		writable: true,
		value: Array
	},

	/**
	 * Returns a copy of the array with all "empty" items (as defined by {@linkcode Firebolt.isEmpty}) removed.
	 * 
	 * @function Array.prototype.clean
	 * @param {Boolean} [allowEmptyStrings=false] - Set this to `true` to keep zero-length strings in the array.
	 * @returns {Array} A clean copy of the array.
	 * @see Firebolt.isEmpty
	 */
	clean: {
		writable: true,
		value: function(allowEmptyStrings) {
			var cleaned = [],
				i = 0;
			for (; i < this.length; i++) {
				if (!Firebolt.isEmpty(this[i], allowEmptyStrings)) {
					cleaned.push(this[i]);
				}
			}
			return cleaned;
		}
	},

	/**
	 * Removes all elements from the array.
	 * 
	 * @function Array.prototype.clear
	 */
	clear: {
		value: function() {
			this.length = 0;
		}
	},

	/**
	 * Returns a duplicate of the array, leaving the original array intact.
	 * 
	 * @function Array.prototype.clone
	 * @returns {Array} A copy of the array.
	 */
	clone: {
		writable: true,
		value: function() {
			var len = this.length,
				clone = new Array(len),
				i = 0;
			for (; i < len; i++) {
				clone[i] = this[i];
			}
			return clone;
		}
	},

	/**
	 * Determines if the input item is in the array.
	 * 
	 * @function Array.prototype.contains
	 * @returns {Boolean} `true` if the item is in the array; else `false`.
	 */
	contains: {
		value: function(e) {
			return this.indexOf(e) >= 0;
		}
	},

	/**
	 * Determines if the arrays are equal by doing a shallow comparison of their elements using strict equality.  
	 * NOTE: The order of elements in the arrays DOES matter. The elements must be found in the same order for the arrays to be considered equal.
	 * 
	 * @function Array.prototype.equals
	 * @param {Array|Enumerable} array - Array or other enumerable object that has a `length` property.
	 * @returns {Boolean} `true` if the arrays are equal; else `false`.
	 */
	equals: {
		value: function(array) {
			if (this === array) { //Easy check
				return true;
			}
			if (this.length !== array.length) {
				return false;
			}
			for (var i = 0; i < array.length; i++) {
				if (this[i] !== array[i]) {
					return false;
				}
			}
			return true;
		}
	},

	/**
	 * Returns an array containing every item that is in both this array and the input array.
	 * 
	 * @function Array.prototype.intersect
	 * @param {Array|Enumerable} array - Array or other enumerable object that has a `length` property.
	 * @returns {Array} An array that is the intersection of this array and the input array.
	 * @example
	 * [1, 2, 3].intersect([2, 3, 4]);  // returns [2, 3]
	 */
	intersect: {
		value: function(array) {
			var intersection = new this.__C__(),
				i = 0;
			for (; i < array.length; i++) {
				if (this.contains(array[i]) && intersection.indexOf(array[i]) < 0) {
					intersection.push(array[i]);
				}
			}
			return intersection;
		}
	},

	/**
	 * Returns the last item of the array.
	 * 
	 * @function Array.prototype.last
	 * @returns {*} The last item in the array, or `undefined` if the array is empty.
	 */
	last: {
		value: function() {
			return this[this.length - 1];
		}
	},

	/**
	 * Removes all occurrences of the passed in items from the array if they exist in the array.
	 * 
	 * @function Array.prototype.remove
	 * @param {...*} items - Items to remove from the array.
	 * @returns {Array} A reference to the array (so it's chainable).
	 */
	remove: {
		writable: true,
		value: function() {
			for (var rindex, i = 0; i < arguments.length; i++) {
				while ((rindex = this.indexOf(arguments[i])) >= 0) {
					this.splice(rindex, 1);
					if (!this.length) {
						return this; //Exit early since there is nothing left to remove
					}
				}
			}

			return this;
		}
	},

	/**
	 * Returns an array containing every distinct item that is in either this array or the input array.
	 * 
	 * @function Array.prototype.union
	 * @param {...Array} array - One or more arrays or array-like objects.
	 * @returns {Array} An array that is the union of this array and the input array.
	 * @example
	 * [1, 2, 3].union([2, 3, 4, 5]);  // returns [1, 2, 3, 4, 5]
	 */
	union: {
		value: function() {
			var union = this.unique(),
				i = 0,
				array,
				j;
			for (; i < arguments.length; i++) {
				array = arguments[i];
				for (j = 0; j < array.length; j++) {
					if (union.indexOf(array[j]) < 0) {
						union.push(array[j]);
					}
				}
			};
			return union;
		}
	},

	/**
	 * Returns a duplicate-free clone of the array.
	 * 
	 * @function Array.prototype.unique
	 * @returns {Array} An array of unique items.
	 * @example
	 * [1, 2, 3, 2, 1].unique();  // returns [1, 2, 3]
	 */
	unique: {
		value: function() {
			var uniq = new this.__C__(),
				i = 0;
			for (; i < this.length; i++) {
				if (uniq.indexOf(this[i]) < 0) {
					uniq.push(this[i]);
				}
			}
			return uniq;
		}
	},

	/**
	 * Returns a copy of the current array without any elements from the input parameters.
	 * 
	 * @function Array.prototype.without
	 * @param {...*} items - One or more items to leave out of the returned array.
	 * @returns {Array}
	 * @example
	 * [1, 2, 3, 4, 5, 6].without(3, 4, 6);  // returns [1, 2, 5]
	 */
	without: {
		value: function() {
			var array = new this.__C__(),
				i = 0,
				j;
			skip:
			for (; i < this.length; i++) {
				for (j = 0; j < arguments.length; j++) {
					if (this[i] === arguments[j]) {
						continue skip;
					}
				}
				array.push(this[i]);
			}
			return array;
		}
	}
});

//#endregion Array


//#region =========================== Element ================================

/**
 * @class Element
 * @classdesc The HTML DOM Element interface.
 * @mixes Node
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/element|Element - Web API Interfaces | MDN}
 */

/**
 * Returns a list of the elements within the element that match the specifed CSS selector.  
 * Alias of `Element.querySelectorAll()`.
 * 
 * @function Element.prototype.$
 * @param {String} selector
 * @returns {NodeList} A list of selected elements.
 */
ElementPrototype.$ = ElementPrototype.querySelectorAll;

/**
 * Returns the first element within the element that matches the specified CSS selector.  
 * Alias of `Element.querySelector()`.
 * 
 * @function Element.prototype.$1
 * @param {String} selector
 * @returns {?Element}
 */
ElementPrototype.$1 = ElementPrototype.querySelector;

/**
 * Returns a list of the elements within the element with the specified class name.  
 * Alias of `Element.getElementsByClassName()`.
 * 
 * @function Element.prototype.$CLS
 * @param {String} className
 * @returns {HTMLCollection|NodeList} A collection of elements with the specified class name.
 */
ElementPrototype.$CLS = ElementPrototype.getElementsByClassName;

/**
 * Returns a list of the elements within the element with the specified tag name.  
 * Alias of `Element.getElementsByTagName()`.
 * 
 * @function Element.prototype.$TAG
 * @param {String} tagName
 * @returns {HTMLCollection|NodeList} A collection of elements with the specified tag name.
 */
ElementPrototype.$TAG = ElementPrototype.getElementsByTagName;

/**
 * Determines if the element matches the specified CSS selector.
 * 
 * @function Element.prototype.matches
 * @param {String} selector - A CSS selector string.
 * @returns {Boolean} `true` if the element matches the selector; else `false`.
 */
ElementPrototype.matches = ElementPrototype.matches || ElementPrototype.webkitMatchesSelector || ElementPrototype.mozMatchesSelector || ElementPrototype.msMatchesSelector || ElementPrototype.oMatchesSelector;

//#endregion Element


//#region =========================== Firebolt ===============================

/**
 * The Firebolt namespace object and selector function.
 * Can be referenced by the synonyms `FB` and `$` (on pages where `$` has not already been defined).
 * @namespace Firebolt
 */

/**
 * The global Firebolt function. Can be referenced by the synonyms `FB` and `$` (on pages where `$` has not already been defined).  
 * Returns a list of the elements either found in the DOM that match the passed in CSS selector or created by passing an HTML string.
 * 
 * @global
 * @variation 2
 * @function Firebolt
 * @param {String} string - A CSS selector string or an HTML string.
 * @returns {NodeList|HTMLCollection} A list of selected elements or newly created elements.
 * 
 * @example
 * $('button.btn-success') // Returns all button elements with the class "btn-success"
 * $('str <p>content</p>') // Creates a set of nodes and returns it as a NodeList (in this case ["str ", <p>content</p>])
 * $('1<br>2<br>3 >');     // Returns ["1", <br>​, "2", <br>​, "3 >"]
 * $.create('div')         // Calls Firebolt's `create()` method to create a new div element 
 */
Firebolt =
	isIE //Define the Firebolt selector specifically for IE (because IE is awful with querySelectorAll for IDs)
	? function(str) {
		if (str[0] === '#') { //Check for a single ID
			if (rgxClassOrId.test(str)) {
				var collection = new NodeCollection(),
					element = document.getElementById(str.slice(1));
				if (element) {
					collection.length = 1;
					collection[0] = element;
				}
				return collection;
			}
		}
		else if (str[0] === '.') { //Check for a single class name
			if (rgxClassOrId.test(str)) {
				return document.getElementsByClassName(str.slice(1));
			}
		}
		else if (rgxTag.test(str)) { //Check for a single tag name
			return document.getElementsByTagName(str);
		}
		else if (isHtml(str)) { //Check if the string is an HTML string
			return htmlToNodes(str);
		}
		return document.querySelectorAll(str);
	}
	: function(str) {
		if (str[0] !== '#') { //Filter out selection by ID
			if (str[0] === '.') { //Check for a single class name
				if (rgxClassOrId.test(str)) {
					return document.getElementsByClassName(str.slice(1));
				}
			}
			else if (rgxTag.test(str)) { //Check for a single tag name
				return document.getElementsByTagName(str);
			}
			else if (isHtml(str)) { //Check if the string is an HTML string
				return htmlToNodes(str);
			}
		}
		return document.querySelectorAll(str);
	};

/**
 * Perform an asynchronous HTTP (Ajax) request.  
 * See the next function description for more information.
 * 
 * @param {String} url - A string containing the URL to which the request will be sent.
 * @param {Object} [settings] - A set of key/value pairs that configure the Ajax request. All settings are optional.
 * @memberOf Firebolt
 */
/**
 * Perform an asynchronous HTTP (Ajax) request.
 * 
 * For documentation, see {@link http://api.jquery.com/jQuery.ajax/|jQuery.ajax()}.  
 * However, Firebolt AJAX requests differ from jQuery's in the following ways:
 * 
 * + Instead of passing a "jqXHR" to callbacks, the native XMLHttpRequest object is passed.
 * + The `context` setting defaults to the XMLHttpRequest object instead of the settings object.
 * + The `crossDomain` setting always defaults to `false`.
 * + The `contents` and `converters` settings are not supported.
 * + The `ifModifed` settings is currently not supported.
 * + The `data` setting is appended to the URL as a string for GET and HEAD requests and may be a string or a plain object or array to serialize.
 * + The `processData` setting has been left out because Firebolt will automatically process only plain objects and arrays
 * (so you don't need to set it to `false` to send a DOMDocument or another type of data&emsp;such as a FormData object).
 * + The `global` setting and the global AJAX functions defined by jQuery are not supported.
 * 
 * To get the full set of AJAX features that jQuery provides, use the Firebolt AJAX extension plugin (if there ever is one).
 * 
 * @param {Object} [settings] - A set of key/value pairs that configure the Ajax request. All settings are optional.
 * @returns {XMLHttpRequest} The XMLHttpRequest object this request is using (only for requests where the dataType is not "script" or "jsonp".
 * @memberOf Firebolt
 */
Firebolt.ajax = function(url, settings) {
	//Parameter processing
	if (typeofString(url)) {
		settings = settings || {};
		settings.url = url;
	}
	else {
		settings = url;
	}

	//Merge the passed in settings object with the default values
	settings = extend({}, ajaxSettings, settings);

	url = settings.url;

	//Create the XMLHttpRequest and give it settings
	var xhr = extend(new settings.xhr(), settings.xhrFields),
		async = settings.async,
		beforeSend = settings.beforeSend,
		complete = settings.complete || [],
		completes = typeof complete == 'function' ? [complete] : complete,
		context = settings.context || xhr,
		dataType = settings.dataType,
		dataTypeJSONP = dataType == 'jsonp',
		error = settings.error,
		errors = typeof error == 'function' ? [error] : error,
		crossDomain = settings.crossDomain,
		success = settings.success,
		successes = typeof success == 'function' ? [success] : success,
		timeout = settings.timeout,
		type = settings.type,
		isGetOrHead = rgxGetOrHead.test(type),
		userData = settings.data,
		textStatus,
		i;

	function callCompletes(errorThrown) {
		//Execute the status code callback (if there is one that matches the status code)
		if (settings.statusCode) {
			var callback = settings.statusCode[xhr.status];
			if (callback) {
				if (textStatus == 'success') {
					callback.call(context, userData, textStatus, xhr);
				}
				else {
					callback.call(context, xhr, textStatus, errorThrown || getAjaxErrorStatus(xhr));
				}
			}
		}
		//Execute all the complete callbacks
		for (i = 0; i < completes.length; i++) {
			completes[i].call(context, xhr, textStatus, errorThrown || getAjaxErrorStatus(xhr));
		}
	}

	function callErrors(errorThrown) {
		if (error) {
			//Execute all the error callbacks
			for (i = 0; i < errors.length; i++) {
				errors[i].call(context, xhr, textStatus, errorThrown || getAjaxErrorStatus(xhr));
			}
		}
	}

	function callSuccesses() {
		//Handle last-minute JSONP
		if (dataTypeJSONP) {
			//Call errors and return if the JSONP function was not called
			if (!responseContainer) {
				textStatus = 'parsererror';
				return callErrors(jsonpCallback + " was not called");
			}

			//Set the data to the first item in the response
			userData = responseContainer[0];
		}

		textStatus = 'success';

		if (success) {
			//Call the user-supplied data filter function if there is one
			if (settings.dataFilter) {
				userData = settings.dataFilter(userData, dataType);
			}
			//Execute all the success callbacks
			for (i = 0; i < successes.length; i++) {
				successes[i].call(context, userData, textStatus, xhr);
			}
		}
	}

	//Cross domain checking
	if (!crossDomain && url.contains('//')) {
		var domainMatch = location.href.match(rgxDomain) || [];
		crossDomain = url.indexOf(domainMatch[1]) < 0;
	}

	if (userData) {
		//Process data if necessary
		if (Array.isArray(userData) || isPlainObject(userData)) {
			userData = Firebolt.param(userData, settings.traditional);
		}

		//If the request is a GET or HEAD, append the data string to the URL
		if (isGetOrHead) {
			url = url.URLAppend(userData);
			userData = undefined; //Clear the data so it is not sent later on
		}
	}

	if (dataTypeJSONP) {
		var jsonpCallback = settings.jsonpCallback,
			responseContainer,
			overwritten;
		if (!typeofString(jsonpCallback)) {
			jsonpCallback = settings.jsonpCallback();
		}

		//Append the callback name to the URL
		url = url.URLAppend(settings.jsonp + '=' + jsonpCallback);

		// Install callback
		overwritten = window[jsonpCallback];
		window[jsonpCallback] = function() {
			responseContainer = arguments;
		};

		//Push JSONP cleanup onto complete callback array
		completes.push(function() {
			// Restore preexisting value
			window[jsonpCallback] = overwritten;

			if (settings[jsonpCallback]) {
				//Save the callback name for future use
				oldCallbacks.push(jsonpCallback);
			}

			//Call if `overwritten` was a function and there was a response
			if (responseContainer && typeof overwritten == 'function') {
				overwritten(responseContainer[0]);
			}

			responseContainer = overwritten = undefined;
		});
	}

	if (crossDomain && (dataType == 'script' || dataTypeJSONP)) {
		//Prevent caching unless the user explicitly set cache to true
		if (settings.cache !== true) {
			url = url.URLAppend('_=' + (timestamp++));
		}

		var script = createElement('script').prop({
			charset: settings.scriptCharset || '',
			src: url,
			onload: function() {
				if (timeout) {
					clearTimeout(timeout);
				}
				callSuccesses();
				callCompletes();
			},
			onerror: function(ex) {
				if (timeout) {
					clearTimeout(timeout);
				}
				textStatus = 'error';
				callErrors(ex.type);
				callCompletes(ex.type);
			}
		}).prop(isOldIE ? 'defer' : 'async', async);

		//Always remove the script after the request is done
		completes.push(function() {
			if (script.parentNode) { //Check for parent node before attempting to remove (may have been removed by timeout)
				script.remove();
			}
		});

		if (beforeSend && beforeSend.call(context, xhr, settings) === false) {
			//If the beforeSend function returned false, do not send the request
			return false;
		}

		//Add timeout
		if (timeout) {
			timeout = setTimeout(function() {
				script.remove();
				textStatus = 'timeout';
				callErrors();
				callCompletes(textStatus);
			}, timeout);
		}

		//Append the script to the head of the document to load it
		document.head.appendChild(script);
	}
	else {
		//Data just for real XHRs
		var headers = settings.headers,
			lastState = 0,
			statusCode;

		if (settings.mimeType) {
			xhr.overrideMimeType(settings.mimeType);
		}

		//Prevent caching if necessary
		if (isGetOrHead && settings.cache === false) {
			url = url.URLAppend('_=' + (timestamp++));
		}

		//The main XHR function for when the request has loaded (and track states in between for abort or timeout)
		xhr.onreadystatechange = function() {
			if (xhr.readyState !== 4) {
				lastState = xhr.readyState;
				return;
			}

			//For browsers that don't natively support XHR timeouts
			if (timeout) {
				clearTimeout(timeout);
			}

			statusCode = xhr.status;

			if (statusCode >= 200 && statusCode < 300 || statusCode === 304 || settings.isLocal && xhr.responseText) { //Success
				if (statusCode === 204 || type === 'HEAD') { //If no content
					textStatus = 'nocontent';
				}
				else if (statusCode === 304) { //If not modified
					textStatus = 'notmodified';
				}
				else {
					textStatus = 'success';
				}

				try {
					//Only need to process data of there is content
					if (textStatus != 'nocontent') {
						//If the data type has not been set, try to figure it out
						if (!dataType) {
							var contentType = xhr.getResponseHeader('Content-Type');
							if (contentType) {
								if (contentType.contains('/xml')) {
									dataType = 'xml';
								}
								else if (contentType.contains('/json')) {
									dataType = 'json';
								}
								else if (contentType.contains('script')) {
									dataType = 'script';
								}
							}
						}

						//Set data based on the data type
						if (dataType == 'xml') {
							userData = xhr.responseXML;
						}
						else if (dataType == 'json') {
							userData = JSON.parse(xhr.responseText);
						}
						else {
							userData = xhr.responseText;

							if (dataType == 'script' || dataTypeJSONP) {
								Firebolt.globalEval(userData);
							}
						}
					}
					else {
						userData = '';
					}

					//Invoke the success callbacks
					callSuccesses();
				}
				catch (e) {
					textStatus = 'parsererror';
					callErrors();
				}
			}
			else { //Error
				if (textStatus != 'timeout') {
					textStatus = lastState < 3 ? 'abort' : 'error';
				}
				callErrors();
			}

			//Invoke the complete callbacks
			callCompletes();
		};

		//Open the request
		xhr.open(type, url, async, settings.username, settings.password);

		//Merge provided headers with defaults
		headers = extend({ 'X-Requested-With': 'XMLHttpRequest' }, headers);

		//Set the content type header if the user has changed it from the default or there is data to submit
		if (settings.contentType != ajaxSettings.contentType || userData) {
			headers['Content-Type'] = settings.contentType;
		}

		//If the data type has been set, set the accept header
		if (settings.dataType) {
			headers['Accept'] = settings.accept[settings.dataType] || settings.accept['*'];
		}

		//Set the request headers in the XHR
		for (i in headers) {
			xhr.setRequestHeader(i, headers[i]);
		}

		if (beforeSend && beforeSend.call(context, xhr, settings) === false) {
			//If the beforeSend function returned false, do not send the request
			return false;
		}

		//If a timeout still needs to be added, do that now
		if (timeout) {
			timeout = setTimeout(function() {
				textStatus = 'timeout';
				xhr.abort();
			}, timeout);
		}

		//Send the XHR
		xhr.send(userData);
	}

	return xhr;
};

/* Expose the AJAX settings (just because jQuery does this, even though it's not documented). */
Firebolt.ajaxSettings = ajaxSettings;

/**
 * Sets default values for future Ajax requests. Use of this function is not recommended.
 * 
 * @param {Object} options - A set of key/value pairs that configure the default Ajax settings. All options are optional.
 * @memberOf Firebolt
 */
Firebolt.ajaxSetup = function(options) {
	return extend(ajaxSettings, options);
}

/**
 * Creates a new element with the specified tag name and attributes (optional).  
 * Partially an alias of `document.createElement()`.
 * 
 * @param {String} tagName
 * @param {Object} [attributes] - The JSON-formatted attributes that the element should have once constructed.
 * @returns {Element}
 * @memberOf Firebolt
 */
Firebolt.create = createElement;

/**
 * Calls the passed in function after the specified amount of time in milliseconds.
 * 
 * @param {Function} callback - A function to be called after the specified amount of time.
 * @param {Number} ms - An integer between 0 and +∞ : [ 0, +∞).
 * @returns {Object} An object that can be used to cancel the callback before it is executed by calling `object.clear()`.
 * @memberOf Firebolt
 */
Firebolt.delay = function(callback, ms) {
	return new function() {
		var clearRef = setTimeout(callback, ms);
		this.clear = function() {
			clearTimeout(clearRef);
		};
	};
};

/**
 * Extend the "Firebolt object" (a.k.a. NodeCollection, NodeList, and HTMLCollection).
 * 
 * @param {Object} object - An object with properties to add to the prototype of the collections returned by Firebolt.
 * @memberOf Firebolt
 */
/**
 * Merge the contents of one or more objects into the first object.
 * 
 * @param {Object} target - The object that will receive the new properties.
 * @param {...Object} object - One or more objects whose properties will be added to the target object.
 * @returns {Object} The target object.
 * @memberOf Firebolt
 */
Firebolt.extend = extend;

/**
 * Creates a new DocumentFragment and (optionally) appends the passed in content to it.
 * 
 * @param {...(String|Node|Node[])} [content] - One or more HTML strings, nodes, or collections of nodes to append to the fragment.
 * @returns {DocumentFragment} The newly created document fragment.
 * @memberOf Firebolt
 */
Firebolt.frag = function() {
	return createFragment(arguments);
};

/**
 * Load data from the server using a HTTP GET request.
 * 
 * @param {String} url - A string containing the URL to which the request will be sent.
 * @param {String|Object} [data] - A string or object that is sent to the server with the request as a query string.
 * @param {Function|Function[]} [success(data, textStatus, xhr)] - A callback function that is executed if the request succeeds.
 * @param {String} [dataType] - The type of data expected from the server. Default: Intelligent Guess (xml, json, script, or html).
 * @memberOf Firebolt
 */
Firebolt.get = function(url, userData, success, dataType) {
	return Firebolt.ajax({
		url: url,
		data: userData,
		success: success,
		dataType: dataType
	});
};

/**
 * Load JSON-encoded data from the server using a GET HTTP request.
 * 
 * @param {String} url - A string containing the URL to which the request will be sent.
 * @param {String|Object} [data] - A string or object that is sent to the server with the request as a query string.
 * @param {Function|Function[]} [success(data, textStatus, xhr)] - A callback function that is executed if the request succeeds.
 * @memberOf Firebolt
 */
Firebolt.getJSON = function(url, userData, success) {
	return Firebolt.get(url, userData, success, 'json');
};

/**
 * Load a JavaScript file from the server using a GET HTTP request, then execute it.
 * 
 * @param {String} url - A string containing the URL to which the request will be sent.
 * @param {Function|Function[]} [success(data, textStatus, xhr)] - A callback function that is executed if the request succeeds.
 * @memberOf Firebolt
 */
Firebolt.getScript = function(url, success) {
	return Firebolt.get(url, '', success, 'script');
};

/**
 * Executes some JavaScript code globally.
 * 
 * @param {String} code - The JavaScript code to execute.
 * @memberOf Firebolt
 */
Firebolt.globalEval = function(code) {
	var indirect = eval;

	code = code.trim();

	if (code) {
		//If the code begins with a strict mode pragma, execute code by injecting a script tag into the document.
		if (code.lastIndexOf('use strict', 1) === 1) {
			createElement('script').prop('text', code).appendTo(document.head).remove();
		}
		else {
			//Otherwise, avoid the DOM node creation, insertion and removal by using an inderect global eval
			indirect(code);
		}
	}
};

/**
 * HTML-decodes the passed in string and returns the result.
 * 
 * @param {String} string - The string to decode.
 * @returns {String} The HTML-decoded text.
 * @memberOf Firebolt
 */
Firebolt.htmlDecode = function(str) {
	return createElement('div').html(str).text();
};

/**
 * HTML-encodes the passed in string and returns the result.
 * 
 * @param {String} string - The string to encode.
 * @returns {String} The HTML-encoded text.
 * @memberOf Firebolt
 */
Firebolt.htmlEncode = function(str) {
	return createElement('div').text(str).html();
};

/**
 * Determines if the passed in value is considered empty. The value is considered empty if it is one of the following:
 * <ul>
 * <li>`null`</li>
 * <li>`undefined`</li>
 * <li>a zero-length array</li>
 * <li>an empty object (as defined by {@linkcode Firebolt.isEmptyObject})</li>
 * <li>a zero-length string (unless the `allowEmptyString` parameter is set to a truthy value)</li>
 * </ul>
 * 
 * @param {*} value - The value to be tested.
 * @param {Boolean} [allowEmptyString=false] - Set this to true to regard zero-length strings as not empty.
 * @returns {Boolean}
 * @memberOf Firebolt
 */
Firebolt.isEmpty = function(value, allowEmptyString) {
	return value == null || typeofString(value) && !allowEmptyString && !value || typeof value == 'object' && isEmptyObject(value);
};

/**
 * Determines if an object is empty (contains no enumerable properties).
 * 
 * @param {Object} object - The object to be tested.
 * @returns {Boolean}
 * @memberOf Firebolt
 */
Firebolt.isEmptyObject = isEmptyObject;

/**
 * Determines if a variable is a plain object.
 * 
 * @param {*} obj - The item to test.
 * @memberOf Firebolt
 */
Firebolt.isPlainObject = isPlainObject;

/**
 * Determines if the user is on a touchscreen device.
 * 
 * @returns {Boolean} `true` if the user is on a touchscreen device; else `false`.
 * @memberOf Firebolt
 */
Firebolt.isTouchDevice = function() {
	return 'ontouchstart' in window || 'onmsgesturechange' in window;
};

/**
 * Creates a serialized representation of an array or object, suitable for use in a URL query string or Ajax request.  
 * Unlike jQuery, arrays will be serialized like objects when `traditional` is not `true`, with the indices of
 * the array becoming the keys of the query string parameters.
 * 
 * @param {Array|Object} obj - An array or object to serialize.
 * @param {Boolean} traditional - A Boolean indicating whether to perform a traditional "shallow" serialization.
 * @returns {String} The serialized string representation of the array or object.
 */
Firebolt.param = function(obj, traditional) {
	return traditional ? serializeTraditional(obj) : serializeRecursive(obj);
}

/* Inspired by: http://stackoverflow.com/questions/1714786/querystring-encoding-of-a-javascript-object */
function serializeRecursive(obj, prefix) {
	var str = '',
		key,
		value,
		cur;
	for (key in obj) {
		value = obj[key];
		if (!isEmptyObject(value)) {
			cur = prefix ? prefix + '[' + key + ']' : key;
			str += (str ? '&' : '')
				+ (typeof value == 'object' ? serializeRecursive(value, cur)
											: encodeURIComponent(cur) + '=' + encodeURIComponent(value));
		}
	}
	return str;
}

function serializeTraditional(obj) {
	var qs = '',
		key,
		value,
		i;
	for (key in obj) {
		//Add the key
		qs += (qs ? '&' : '') + encodeURIComponent(key);

		//Add the value
		value = obj[key];
		if (Array.isArray(value)) {
			for (i = 0; i < value.length; i++) {
				//Add key again for multiple array values
				qs += (i ? '&' + encodeURIComponent(key) : '') + '=' + encodeURIComponent(value[i].toString());
			}
		}
		else {
			qs += '=' + encodeURIComponent(value.toString());
		}
	}

	return qs;
}

/**
 * Specify a function to execute when the DOM is fully loaded.  
 * Executes the function immediately if the DOM has already finished loading.
 * 
 * @memberOf Firebolt
 * @param {Function} callback - A function to execute once the DOM has been loaded.
 */
Firebolt.ready = function(callback) {
	if (document.readyState == 'loading') {
		document.addEventListener('DOMContentLoaded', callback);
	}
	else {
		callback();
	}
};

//#endregion Firebolt


//#region =========================== Function ===============================

/**
 * The JavaScript Function interface.
 * @class Function
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function|Function - JavaScript | MDN}
 */

/**
 * Delays a function call for the specified number of milliseconds.
 * 
 * @function Function.prototype.delay
 * @param {Number} ms - The number of milliseconds to wait before calling the functions.
 * @returns {Object} An object that can be used to cancel the callback before it is executed by calling `object.clear()`.
 */
Function[prototype].delay = function(ms) {
	var that = this;
	return new function() {
		var clearRef = setTimeout(that, ms);
		this.clear = function() {
			clearTimeout(clearRef);
		};
	};
};

//#endregion Function


//#region =========================== Globals ================================

/*
 * Firebolt namespace reference objects.
 */

window.FB = window.Firebolt = Firebolt;
if (!window.$) {
	window.$ = Firebolt;
}

/**
 * PHP-style associative array (Object) of URL parameters.
 * 
 * @global
 * @constant
 * @name $_GET
 * @type {Object.<String, String>}
 * @see {@link http://www.php.net/manual/en/reserved.variables.get.php|PHP: $_GET - Manual}
 */
(function () {
	window.$_GET = {};
	var decode = decodeURIComponent,
		params = location.search.slice(1).split('&'),
		i = 0,
		key_val;
	for (; i < params.length; i++) {
		key_val = params[i].split('=');
		if (key_val[0]) {
			$_GET[decode(key_val[0])] = decode(key_val[1] || '');
		}
	}
})();

/**
 * Returns the first element within the document that matches the specified CSS selector.
 * If no element matches the selector, `null` or `undefined` may be returned.  
 * Alias of `document.querySelector()`, but with optimizations if a single class name, id, or tag name is input as the selector.
 * 
 * @global
 * @param {String} selector
 * @returns {?Element}
 */
window.$1 = function(selector) {
	if (selector[0] === '.') { //Check for a single class name
		if (rgxClassOrId.test(selector)) {
			return document.getElementsByClassName(selector.slice(1))[0];
		}
	}
	else if (selector[0] === '#') { //Check for a single id
		if (rgxClassOrId.test(selector)) {
			return document.getElementById(selector.slice(1));
		}
	}
	else if (rgxTag.test(selector)) { //Check for a single tag name
		return document.getElementsByTagName(selector)[0];
	}
	//else
	return document.querySelector(selector);
}

/**
 * Returns a list of the elements within the document with the specified class name.  
 * Alias of `document.getElementsByClassName()`.
 * 
 * @global
 * @param {String} className
 * @returns {HTMLCollection|NodeList} A list of elements with the specified class name.
 */
window.$CLS = function(className) {
	return document.getElementsByClassName(className);
}

/**
 * Returns the first element within the document with the specified id.  
 * Alias of `document.getElementById()`.
 * 
 * @global
 * @param {String} id
 * @returns {?Element} The element with the specified id.
 */
window.$ID = function(id) {
	return document.getElementById(id);
}

/**
 * Returns a list of the elements within the document with the specified name attribute.  
 * Alias of `document.getElementsByName()`.
 * 
 * @global
 * @param {String} name
 * @returns {HTMLCollection|NodeList} A collection of elements with the specified name attribute.
 */
window.$NAME = function(name) {
	return document.getElementsByName(name);
}

/**
 * Returns a list of the elements within the document with the specified tag name.  
 * Alias of `document.getElementsByTagName()`.
 * 
 * @global
 * @param {String} tagName
 * @returns {HTMLCollection|NodeList} A collection of elements with the specified tag name.
 */
window.$TAG = function(tagName) {
	return document.getElementsByTagName(tagName);
}

//#endregion Globals


//#region ========================= HTMLCollection ===========================

/**
 * @class HTMLCollection
 * @classdesc
 * The DOM HTMLCollection interface.  
 * Has all the same functions as {@link NodeList} (plus one other native function).
 * @see NodeList
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLCollection|HTMLCollection - Web API Interfaces | MDN}
 */

/* Nothing to do. HTMLCollection gets its functions defined in the NodeList section. */

//#endregion HTMLCollection


//#region ========================== HTMLElement =============================

/**
 * @class HTMLElement
 * @classdesc
 * The HTML DOM HTMLElement interface.  
 * It should be noted that all functions that do not have a specified return value, return the calling object,
 * allowing for function chaining.
 * @mixes Element
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement|HTMLElement - Web API Interfaces | MDN}
 */

/**
 * @summary Adds the specified class(es) to the element.
 * 
 * @description
 * <h5>Note:</h5> Unlike jQuery, the format of the space-separated classes required by Firebolt is strict. Each class must
 * be separated by only a single space character and there cannot be whitespace at the beginning or end of the string.
 * ```JavaScript
 * element.addClass('one  two').removeClass('three ');  // Bad syntax
 * element.addClass('one two').removeClass('three');    // Correct syntax
 * ```
 * 
 * @function HTMLElement.prototype.addClass
 * @param {String} className - One or more space-separated classes to be added to the element's class attribute.
 */
HTMLElementPrototype.addClass = function(value) {
	if (this.className) {
		var newClasses = value.split(' '),
			newClassName = this.className,
			i = 0;
		for (; i < newClasses.length; i++) {
			if (!this.hasClass(newClasses[i])) {
				newClassName += ' ' + newClasses[i];
			}
		}

		//Only assign if the new class name is different (longer) to avoid unnecessary rendering
		if (newClassName.length > this.className.length) {
			this.className = newClassName;
		}
	}
	else {
		//There currently is no class name so the passed in value can easily be set as the class name
		this.className = value;
	}

	return this;
};

/*
 * More performant version of Node#afterPut for HTMLElements.
 * @see Node#afterPut
 */
HTMLElementPrototype.afterPut = function() {
	var i = arguments.length - 1,
		arg;

	for (; i >= 0; i--) {
		if (typeofString(arg = arguments[i])) {
			this[insertAdjacentHTML]('afterend', arg);
		}
		else {
			//When arg is a collection of nodes, create a fragment by passing the collection in an array
			//(that is the form of input createFragment expects since it normally takes a function's arg list)
			insertAfter(arg instanceof Node ? arg : createFragment([arg]), this);
		}
	}

	return this;
}

/*
 * More performant version of Node#appendWith for HTMLElements.
 * @see Node#appendWith
 */
HTMLElementPrototype.appendWith = function() {
	var i = 0,
		arg;

	for (; i < arguments.length; i++) {
		if (typeofString(arg = arguments[i])) {
			this[insertAdjacentHTML]('beforeend', arg);
		}
		else {
			//When arg is a collection of nodes, create a fragment by passing the collection in an array
			//(that is the form of input createFragment expects since it normally takes a function's arg list)
			this.appendChild(arg instanceof Node ? arg : createFragment([arg]));
		}
	}

	return this;
}

/**
 * Gets the value of the element's specified attribute.
 * 
 * @function HTMLElement.prototype.attr
 * @param {String} attribute - The name of the attribute who's value you want to get.
 * @returns {String} The value of the attribute.
 */
/**
 * Sets the element's specified attribute.
 * 
 * @function HTMLElement.prototype.attr
 * @param {String} attribute - The name of the attribute who's value should be set.
 * @param {String} value - The value to set the specified attribute to.
 */
/**
 * Sets the specified attributes of the element.
 * 
 * @function HTMLElement.prototype.attr
 * @param {Object} attributes - An object of attribute-value pairs to set.
 */
HTMLElementPrototype.attr = function(attrib, value) {
	if (isUndefined(value)) {
		if (typeofString(attrib)) {
			return this.getAttribute(attrib); //Get
		}
		for (var attribute in attrib) {
			this.setAttribute(attribute, attrib[attribute]); //Set multiple
		}
	}
	else {
		this.setAttribute(attrib, value); //Set single
	}

	return this;
};

/*
 * More performant version of Node#beforePut for HTMLElements.
 * @see Node#beforePut
 */
HTMLElementPrototype.beforePut = function() {
	var i = 0,
		arg;

	for (; i < arguments.length; i++) {
		if (typeofString(arg = arguments[i])) {
			this[insertAdjacentHTML]('beforebegin', arg);
		}
		else {
			//When arg is a collection of nodes, create a fragment by passing the collection in an array
			//(that is the form of input createFragment expects since it normally takes a function's arg list)
			insertBefore(arg instanceof Node ? arg : createFragment([arg]), this);
		}
	}

	return this;
}

/**
 * Gets the element's computed style object.
 * 
 * @function HTMLElement.prototype.css
 * @returns {Object.<String, String>} The element's computed style object.
 */
/**
 * Gets the value of the element's specified style property.
 * 
 * @function HTMLElement.prototype.css
 * @param {String} propertyName - The name of the style property who's value you want to retrieve.
 * @returns {String} The value of the specifed style property.
 */
/**
 * Sets the element's specified style property.
 * 
 * @function HTMLElement.prototype.css
 * @param {String} propertyName - The name of the style property to set.
 * @param {String|Number} value - A value to set for the specified property.
 */
/**
 * Sets CSS style properties.
 * 
 * @function HTMLElement.prototype.css
 * @param {Object.<String, String|Number>} properties - An object of CSS property-values.
 */
/**
 * Explicitly sets the element's inline CSS style, removing or replacing any current inline style properties.
 * 
 * @function HTMLElement.prototype.css
 * @param {String} cssText - A CSS style string. To clear the style, pass in an empty string.
 */
HTMLElementPrototype.css = function(prop, value) {
	if (isUndefined(prop)) {
		return getComputedStyle(this);
	}

	if (typeofString(prop)) {
		if (isUndefined(value)) {
			if (prop && !prop.contains(':')) {
				//Get the specified property
				return getComputedStyle(this)[prop];
			}
			//Else set the element's css text
			this.style.cssText = prop;
		}
		else {
			//Set the specified property
			this.style[prop] = value;
		}
	}
	else {
		//Set all specifed properties
		extend(this.style, prop);
	}

	return this;
};

/**
 * Removes all of the element's child nodes.
 * 
 * @function HTMLElement.prototype.empty
 * @example
 * // HTML (before)
 * <div id="mydiv">
 *     <span>Inside Span</span>
 *     Some Text
 * </div>
 *
 * // JavaScript
 * $ID('mydiv').empty();
 *
 * // HTML (after)
 * <div id="mydiv"></div>
 */
HTMLElementPrototype.empty = function() {
	while (this.childNodes.length) {
		this.removeChild(this.childNodes[0]);
	}

	return this;
};

/**
 * Determines if the element's class list has the specified class name.
 * 
 * @function HTMLElement.prototype.hasClass
 * @param {String} className - A string containing a single class name.
 * @returns {Boolean} `true` if the class name is in the element's class list; else `false`.
 */
HTMLElementPrototype.hasClass = function(className) {
	return this.classList.contains(className);
};

/**
 * Hides the element by setting its display style to 'none'.
 * 
 * @function HTMLElement.prototype.hide
 */
HTMLElementPrototype.hide = function() {
	this.style.display = 'none';

	return this;
};

/**
 * Gets the element's inner HTML.
 * 
 * @function HTMLElement.prototype.html
 * @returns {String} The element's inner HTML.
 */
/**
 * Sets the element's inner HTML.
 * 
 * @function HTMLElement.prototype.html
 * @param {String} innerHTML - An HTML string.
 */
HTMLElementPrototype.html = function(innerHTML) {
	if (isUndefined(innerHTML)) {
		return this.innerHTML; //Get
	}
	this.innerHTML = innerHTML; //Set

	return this;
};

/**
 * Gets the element's current coordinates relative to the document.
 * 
 * @function HTMLElement.prototype.offset
 * @returns {{top: Number, left: Number}} An object containing the coordinates detailing the element's distance from the top and left of the screen.
 * @example
 * // HTML
 * <body style="margin: 0">
 *   <div id='a' style="position: absolute; margin: 10px; left: 10px"></div>
 * </body>
 * 
 * // JavaScript
 * var offset = $ID('a').offset();
 * alert( offset.top + ', ' + offset.left );  // "10, 20"
 */
HTMLElementPrototype.offset = function() {
	var el = this,
		offset = {
			top: 0,
			left: 0
		};
	do {
		offset.top += el.offsetTop + el.clientTop;
		offset.left += el.offsetLeft + el.clientLeft;
	} while (el = el.offsetParent)
	return offset;
};

/*
 * More performant version of Node#prependWith for HTMLElements.
 * @see Node#prependWith
 */
HTMLElementPrototype.prependWith = function() {
	var i = arguments.length - 1,
		arg;

	for (; i >= 0; i--) {
		if (typeofString(arg = arguments[i])) {
			this[insertAdjacentHTML]('afterbegin', arg);
		}
		else {
			//When arg is a collection of nodes, create a fragment by passing the collection in an array
			//(that is the form of input createFragment expects since it normally takes a function's arg list)
			prepend(arg instanceof Node ? arg : createFragment([arg]), this);
		}
	}

	return this;
}

/**
 * Gets the value of the element's specified property.
 * 
 * @function HTMLElement.prototype.prop
 * @param {String} property - The name of the property who's value you want to get.
 * @returns {?} The value of the property being retrieved.
 */
/**
 * Sets the specified property of the element.
 * 
 * @function HTMLElement.prototype.prop
 * @param {String} property - The name of the property to be set.
 * @param {*} value - The value to set the property to.
 */
/**
 * Sets the specified properties of the element.
 * 
 * @function HTMLElement.prototype.prop
 * @param {Object} properties - An object of property-value pairs to set.
 */
HTMLElementPrototype.prop = function(prop, value) {
	if (isUndefined(value)) {
		if (typeofString(prop)) {
			return this[prop]; //Get
		}
		extend(this, prop); //Set multiple
	}
	else {
		this[prop] = value; //Set single
	}

	return this;
};

/**
 * Removes the specified attribute from the element.
 * 
 * @function HTMLElement.prototype.removeAttr
 * @param {String} attribute - The name of the attribute to remove.
 */
HTMLElementPrototype.removeAttr = function(attribute) {
	this.removeAttribute(attribute);

	return this;
};

/**
 * @summary Removes the specified class(es) or all classes from the element.
 * 
 * @description
 * <h5>Note:</h5> Unlike jQuery, the format of the space-separated classes required by Firebolt is strict. Each class must
 * be separated by only a single space character and there cannot be whitespace at the beginning or end of the string.
 * ```JavaScript
 * element.addClass('one  two').removeClass('three ');  // Bad syntax
 * element.addClass('one two').removeClass('three');    // Correct syntax
 * ```
 * 
 * @function HTMLElement.prototype.removeClass
 * @param {String} [className] - One or more space-separated classes to be removed from the element's class attribute.
 */
HTMLElementPrototype.removeClass = function(value) {
	if (isUndefined(value)) {
		this.className = ''; //Remove all classes
	}
	else {
		this.classList.remove.apply(this.classList, value.split(' '));
	}
	
	return this;
};

/**
 * Removes the specified property from the element.
 * 
 * @function HTMLElement.prototype.removeProp
 * @param {String} propertyName - The name of the property to remove.
 */
HTMLElementPrototype.removeProp = function(propertyName) {
	delete this[propertyName];

	return this;
};

/**
 * Shows an element by giving it a certain display style. If no parameter is passed in,
 * Firebolt determines the element's default display style and sets it to that.  
 * NOTE: The element's default display style may be 'none', in which case the element would not be shown).
 * 
 * @function HTMLElement.prototype.show
 * @param {Number|String} [style] - The style of display the element should be shown with. Possibilities are:
 * <ul>
 * <li>0 => 'block'</li>
 * <li>1 => 'inline-block'</li>
 * <li>2 => 'inline'</li>
 * </ul>
 * For other display types, only the string parameter will be accepted.  
 * If the arguement is left blank, the element's default style will be used.
 */
HTMLElementPrototype.show = function(style) {
	if (typeof style == 'number') {
		switch (style) {
			case 0:
				style = 'block';
				break;
			case 1:
				style = 'inline-block';
				break;
			case 2:
				style = 'inline';
		}
	}
	if (!typeofString(style)) {
		//Create a temporary element of the same type as this element to figure out what the default display value should be
		var temp = createElement(this.tagName, {
			style: 'width:0;height:0;border:0;margin:0;padding:0'
		}).putAfter(document.body.lastChild);
		style = temp.css('display');
		temp.remove();
	}
	this.style.display = style;

	return this;
};

/**
 * @summary Add or remove one or more classes from the element depending on the class's presence (or lack thereof).
 * 
 * @description
 * <h5>Note:</h5> Unlike jQuery, the format of the space-separated classes required by Firebolt is strict. Each class must
 * be separated by only a single space character and there cannot be whitespace at the beginning or end of the string.
 * ```JavaScript
 * element.toggleClass('one  two ');  // Bad syntax
 * element.toggleClass('one two');    // Correct syntax
 * ```
 * 
 * @function HTMLElement.prototype.toggleClass
 * @param {String} [className] - One or more space-separated classes to be toggled. If left empty, the element's current class is toggled.
 */
HTMLElementPrototype.toggleClass = function(value) {
	if (this.className) {
		if (value) {
			var togClasses = value.split(' '),
			curClasses = this.className.split(rgxSpaceChars),
			i = 0;

			//`value` will now be the new class name value
			value = '';

			//Remove existing classes from the array and rebuild the class string without those classes
			for (; i < curClasses.length; i++) {
				if (curClasses[i]) {
					var len = togClasses.length;
					if (togClasses.remove(curClasses[i]).length === len) {
						value += (value ? ' ' : '') + curClasses[i];
					}
				}
			}

			//If there are still classes in the array, they are to be added to the class name
			if (togClasses.length) {
				value += (value ? ' ' : '') + togClasses.join(' ');
			}
		}
		else {
			//Save the element's current class name
			dataPrivate(this, 'togcls', this.className);
			value = ''; //Set to an empty string so the class name will be cleared
		}
	}
	else if (!value) {
		//Retrieve the saved class name
		value = dataPrivate(this, 'togcls') || '';
	}

	//Set the new value
	this.className = value;

	return this;
};

//#endregion HTMLElement


//#region ============================= Node =================================

/**
 * @class Node
 * @classdesc
 * The {@link https://developer.mozilla.org/en-US/docs/Web/API/Node|DOM Node interface}.  
 * It should be noted that all functions that do not have a specified return value, return the calling object,
 * allowing for function chaining.
 * @mixes Object
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node|Node - Web API Interfaces | MDN}
 */

/**
 * Inserts content after the node.
 * 
 * @function Node.prototype.afterPut
 * @param {...(String|Node|NodeCollection)} content - One or more HTML strings, nodes, or collections of nodes to insert.
 * @throws {TypeError|NoModificationAllowedError} The subject node must have a
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.parentNode|ParentNode}.
 */
NodePrototype.afterPut = function() {
	insertAfter(createFragment(arguments), this);

	return this;
}

/**
 * Appends this node to the end of the target element(s).
 * 
 * @function Node.prototype.appendTo
 * @param {String|ParentNode|NodeCollection} target - A specific node, collection of nodes, or a selector to find a set of nodes to which this node will be appended.
 * @throws {HierarchyRequestError} The target(s) must implement the {@link ParentNode} interface.
 */
NodePrototype.appendTo = function(target) {
	if (typeofString(target)) {
		target = Firebolt(target);
	}
	else if (target instanceof Node) {
		return target.appendChild(this);
	}

	var i = 1,
		len = target.length;
	if (len) {
		target[0].appendChild(this);
		for (; i < len; i++) {
			target[0].appendChild(this.cloneNode(true));
		}
	}

	return this;
}

/**
 * Appends content to the end of the node.
 * 
 * @function Node.prototype.appendWith
 * @param {...(String|Node|NodeCollection)} content - One or more HTML strings, nodes, or collections of nodes to insert.
 * @throws {HierarchyRequestError} This node must implement the {@link ParentNode} interface.
 */
NodePrototype.appendWith = function() {
	this.appendChild(createFragment(arguments));

	return this;
}

/**
 * Inserts content before the node.
 * 
 * @function Node.prototype.beforePut
 * @param {...(String|Node|NodeCollection)} content - One or more HTML strings, nodes, or collections of nodes to insert.
 * @throws {TypeError|NoModificationAllowedError} The subject node must have a
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.parentNode|ParentNode}.
 */
NodePrototype.beforePut = function() {
	insertBefore(createFragment(arguments), this);

	return this;
}

/**
 * Prepends content to the beginning of the node.
 * 
 * @function Node.prototype.prependWith
 * @param {...(String|Node|NodeCollection)} content - One or more HTML strings, nodes, or collections of nodes to insert.
 * @throws {HierarchyRequestError} This node must implement the {@link ParentNode} interface.
 */
NodePrototype.prependWith = function() {
	prepend(createFragment(arguments), this);

	return this;
}

/**
 * Prepends this node to the beginning of the target element(s).
 * 
 * @function Node.prototype.prependTo
 * @param {String|ParentNode|NodeCollection} target - A specific node, collection of nodes, or a selector to find a set of nodes to which this node will be prepended.
 * @throws {HierarchyRequestError} The target(s) must implement the {@link ParentNode} interface.
 */
NodePrototype.prependTo = getNodeInsertingFunction(prepend);

/**
 * Inserts this node directly after the specified target(s).
 * 
 * @function Node.prototype.putAfter
 * @param {String|Node|NodeCollection} target - A specific node, collection of nodes, or a selector to find a set of nodes after which this node will be inserted.
 * @throws {TypeError} The target node(s) must have a {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.parentNode|ParentNode}.
 */
NodePrototype.putAfter = getNodeInsertingFunction(insertAfter);

/**
 * Inserts this node directly before the specified target(s).
 * 
 * @function Node.prototype.putBefore
 * @param {String|Node|NodeCollection} target - A specific node, collection of nodes, or a selector to find a set of nodes after which this node will be inserted.
 * @throws {TypeError} The target node(s) must have a {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.parentNode|ParentNode}.
 */
NodePrototype.putBefore = getNodeInsertingFunction(insertBefore);

/**
 * Removes this node from the DOM.
 * 
 * @function Node.prototype.remove
 * @returns void (undefined)
 */
NodePrototype.remove = function() {
	this.parentNode.removeChild(this);
};

/**
 * Gets this node's text content (specifically uses the native JavaScript property `Node.textContent`).
 * 
 * @function Node.prototype.text
 * @returns {String} The node's text content.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.textContent|Node.textContent - Web API Interfaces | MDN}
 */
/**
 * Sets this node's text content (specifically uses the native JavaScript property `Node.textContent`).
 * 
 * @function Node.prototype.text
 * @param {String|*} text - The text or content that will be converted to a string to be set as the node's text content.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.textContent|Node.textContent - Web API Interfaces | MDN}
 */
NodePrototype.text = function(text) {
	if (isUndefined(text)) {
		return this.textContent; //Get
	}

	this.textContent = text; //Set

	return this;
};

/**
 * @class ParentNode
 * @classdesc Interface implemented by {@link https://developer.mozilla.org/en-US/docs/Web/API/Element|Element},
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Document|Document}, and
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment|DocumentFragment} objects.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/ParentNode|ParentNode - Web API Interfaces | MDN}
 */

//#endregion Node


//#region ======================== NodeCollection ============================

/**
 * This constructor is not globally visible and should not be called by user code.
 * 
 * @class NodeCollection
 * @mixes Array
 * @classdesc
 * A mutable collection of DOM nodes. It subclasses the native {@link Array} class (but take note that the
 * {@linkcode NodeCollection#clean|clean}, {@linkcode NodeCollection#remove|remove}, and {@linkcode NodeCollection#filter|filter}
 * functions have been overridden), and has all of the main DOM-manipulating functions.
 * 
 * It should be noted that all functions that do not have a specified return value, return the calling object,
 * allowing for function chaining.
 */
/*
 * @private
 * @constructs NodeCollection
 * @param {NodeList|HTMLCollection|Node[]} [nodes] - The collection of nodes the NodeCollection will be comprised of.
 */
function NodeCollection(nodes) {
	if (nodes) {
		var len = this.length = nodes.length,
			i = 0;
		for (; i < len; i++) {
			this[i] = nodes[i];
		}
	}
}

/* Subclass Array (not perfectly, but pretty close) */
var NodeCollectionPrototype = NodeCollection[prototype] = new Array;

/* Reset the constructor and set the private constructor (which will be inherited by NodeList and HTMLCollection) */
NodeCollectionPrototype.constructor = NodeCollectionPrototype.__C__ = NodeCollection;

/**
 * Adds the queried elements to a copy of the existing collection (if they are not already in the collection)
 * and returns the result.
 * 
 * @function NodeCollection.prototype.add
 * @param {String} selector - A CSS selector to use to find elements to add to the collection.
 * @returns {NodeCollection} The result of unioning the queried elements with the current collection.
 */
/**
 * Adds the newly created elements to a copy of the existing collection and returns the result.
 * 
 * @function NodeCollection.prototype.add
 * @param {String} html - An HTML fragment to add to the collection.
 * @returns {NodeCollection} The result adding the elements created with the HTML to current collection.
 */
/**
 * Adds the element to a copy of the existing collection (if it is not already in the collection)
 * and returns the result.  
 * If you're sure the element is not already in the collection, using {@linkcode NodeCollection#concat|concat}
 * would be more efficient.
 * 
 * @function NodeCollection.prototype.add
 * @param {Element|Node} element - A DOM Element or Node.
 * @returns {NodeCollection} The result of adding the element to the current collection.
 */
/**
 * Returns the union of the current collection and the input one.  
 * If you're sure that none of the elements in the passed in collection are in the current collection,
 * using {@linkcode NodeCollection#concat|concat} would be more efficient.
 * 
 * @function NodeCollection.prototype.add
 * @param {NodeCollection|NodeList|HTMLCollection|Node[]} elements
 * @returns {NodeCollection} The result of adding the input elements to the current collection.
 */
NodeCollectionPrototype.add = function(input) {
	if (input.nodeType) {
		return this.concat(this.contains(input) ? 0 : input); //(this.concat(0) effectively clones the collection)
	}
	return this.union(typeofString(input) ? Firebolt(input) : input);
};

/**
 * Adds the input class name to all elements in the collection.
 * 
 * @function NodeCollection.prototype.addClass
 * @param {String} className - The class to be added to each element in the collection.
 */
NodeCollectionPrototype.addClass = callOnEachElement('addClass');

/**
 * Alias of {@link NodeCollection#afterPut} provided for similarity with jQuery.  
 * Note that Firebolt does not define a method called "after" for Nodes. This is because the DOM Living Standard has defined
 * a native function called `after` for the {@link http://dom.spec.whatwg.org/#interface-childnode|ChildNode Interface} that
 * does not function in the same way as `afterPut`.
 * 
 * @function NodeCollection.prototype.after
 * @see NodeCollection#afterPut
 */
/**
 * Inserts content after each node in the collection.
 * 
 * @function NodeCollection.prototype.afterPut
 * @param {...(String|Node|NodeCollection)} content - One or more HTML strings, nodes, or collections of nodes to insert.
 * @throws {TypeError|NoModificationAllowedError} The subject collection of nodes must only contain nodes that have a
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.parentNode|ParentNode}.
 */
NodeCollectionPrototype.afterPut = NodeCollectionPrototype.after = function() {
	var len = this.length,
		firstNode = this[0];
	if (len > 1) {
		var fragment = createFragment(arguments),
			i = 1;
		for (; i < len; i++) {
			insertAfter(fragment.cloneNode(true), this[i]);
		}
		insertAfter(fragment, firstNode);
	}
	else if (len) { //This collection only has one node
		firstNode.afterPut.apply(firstNode, arguments);
	}

	return this;
}

/**
 * Appends each node in this collection to the end of the specified target(s).
 * 
 * @function NodeCollection.prototype.appendTo
 * @param {String|ParentNode|NodeCollection} target - A specific node, collection of nodes, or a selector to find a set of nodes to which each node will be appended.
 * @throws {HierarchyRequestError} The target(s) must implement the {@link ParentNode} interface.
 */
NodeCollectionPrototype.appendTo = getPutOrToFunction('appendWith');

/**
 * Alias of {@link NodeCollection#appendWith} provided for similarity with jQuery.  
 * Note that Firebolt does not define a method called "append" for Nodes. This is because the DOM Living Standard has defined
 * a native function called `append` for the {@link http://dom.spec.whatwg.org/#interface-parentnode|ParentNode Interface} that
 * does not function in the same way as `appendWith`.
 * 
 * @function NodeCollection.prototype.append
 * @see NodeCollection#appendWith
 */
/**
 * Appends content to the end of each element in the collection.
 * 
 * @function NodeCollection.prototype.appendWith
 * @param {...(String|Node|NodeCollection)} content - One or more HTML strings, nodes, or collections of nodes to insert.
 * @throws {HierarchyRequestError} The nodes in the collection must implement the {@link ParentNoded} interface.
 */
NodeCollectionPrototype.appendWith = NodeCollectionPrototype.append = function() {
	var len = this.length,
		firstNode = this[0];
	if (len > 1) {
		var fragment = createFragment(arguments),
			i = 1;
		for (; i < len; i++) {
			this[i].appendChild(fragment.cloneNode(true));
		}
		firstNode.appendChild(fragment);
	}
	else if (len) { //Only one element to append to
		firstNode.appendWith.apply(firstNode, arguments);
	}

	return this;
}

/**
 * Gets the value of the specified attribute of the first element in the collection.
 * 
 * @function NodeCollection.prototype.attr
 * @param {String} attribute - The name of the attribute who's value you want to get.
 * @returns {String} The value of the attribute.
 */
/**
 * Sets the specified attribute for each element in the collection.
 * 
 * @function NodeCollection.prototype.attr
 * @param {String} attribute - The name of the attribute who's value should be set.
 * @param {String} value - The value to set the specified attribute to.
 */
/**
 * Sets attributes for each element in the collection.
 * 
 * @function NodeCollection.prototype.attr
 * @param {Object} attributes - An object of attribute-value pairs to set.
 */
NodeCollectionPrototype.attr = getFirstSetEachElement('attr', function(numArgs) {
	return numArgs < 2;
});

/**
 * Alias of {@link NodeCollection#beforePut} provided for similarity with jQuery.  
 * Note that Firebolt does not define a method called "before" for Nodes. This is because the DOM Living Standard has defined
 * a native function called `before` for the {@link http://dom.spec.whatwg.org/#interface-childnode|ChildNode Interface} that
 * does not function in the same way as `beforePut`.
 * 
 * @function NodeCollection.prototype.before
 * @see NodeCollection#beforePut
 */
/**
 * Inserts content before each node in the collection.
 * 
 * @function NodeCollection.prototype.beforePut
 * @param {...(String|Node|NodeCollection)} content - One or more HTML strings, nodes, or collections of nodes to insert.
 * @throws {TypeError|NoModificationAllowedError} The subject collection of nodes must only contain nodes that have a
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.parentNode|ParentNode}.
 */
NodeCollectionPrototype.beforePut = NodeCollectionPrototype.before = function() {
	var len = this.length,
		firstNode = this[0];
	if (len > 1) {
		var fragment = createFragment(arguments),
			i = 1;
		for (; i < len; i++) {
			insertBefore(fragment.cloneNode(true), this[i]);
		}
		insertBefore(fragment, firstNode);
	}
	else if (len) { //This collection only has one node
		firstNode.beforePut.apply(firstNode, arguments);
	}

	return this;
}

/**
 * Returns a clone of the collection with all non-elements removed.
 * 
 * @returns {NodeCollection} A reference to the new collection.
 */
NodeCollectionPrototype.clean = function() {
	return this.filter(function(node) {
		return node.nodeType === 1;
	});
}

/**
 * Clicks each element in the list.
 * 
 * @function NodeCollection.prototype.click
 */
NodeCollectionPrototype.click = callOnEachElement('click');

/**
 * Returns a duplicate of the collection, leaving the original intact.
 * 
 * @function NodeCollection.prototype.clone
 * @returns {NodeCollection} A copy of the collection.
 */
NodeCollectionPrototype.clone = function() {
	return new NodeCollection(this);
}

/**
 * Returns a new NodeCollection comprised of this collection joined with other NodeCollection(s) and/or value(s).
 * 
 * @function NodeCollection.prototype.concat
 * @param {...(Node|NodeCollection|NodeList|HTMLCollection|Node[])} nodes - One or more Nodes or NodeCollections to add to the collection.
 * @returns {NodeCollection} A copy of the collection with the added nodes.
 */
NodeCollectionPrototype.concat = function() {
	var collection = new NodeCollection(this),
		i = 0,
		arg;
	for (; i < arguments.length; i++) {
		if (arg = arguments[i]) {
			if (arg instanceof Node) { //Node
				collection.push(arg);
			}
			else { //NodeCollection|NodeList|HTMLCollection|Node[]
				collection.push.apply(collection, arg);
			}
		}
	}
	return collection;
}

/**
 * Gets the computed style object of the first element in the list.
 * 
 * @function NodeCollection.prototype.css
 * @returns {Object.<String, String>} The element's computed style object.
 */
/**
 * Gets the value of the specified style property of the first element in the list.
 * 
 * @function NodeCollection.prototype.css
 * @param {String} propertyName - The name of the style property who's value you want to retrieve.
 * @returns {String} The value of the specifed style property.
 */
/**
 * Sets the specified style property for each element in the list.
 * 
 * @function NodeCollection.prototype.css
 * @param {String} propertyName - The name of the style property to set.
 * @param {String|Number} value - A value to set for the specified property.
 */
/**
 * Sets CSS style properties for each element in the list.
 * 
 * @function NodeCollection.prototype.css
 * @param {Object.<String, String|Number>} properties - An object of CSS property-values.
 */
/**
 * Explicitly sets each elements' inline CSS style, removing or replacing any current inline style properties.
 * 
 * @function NodeCollection.prototype.css
 * @param {String} cssText - A CSS style string. To clear the style, pass in an empty string.
 */
NodeCollectionPrototype.css = getFirstSetEachElement('css', function(numArgs, firstArg) {
	return !numArgs || numArgs < 2 && firstArg && typeofString(firstArg) && !firstArg.contains(':');
});

/**
 * Gets the first element's stored data object.
 * 
 * @function NodeCollection.prototype.data
 * @returns {Object} The element's stored data object.
 */
/**
 * Get the value at the named data store for the first element as set by .data(name, value) or by an HTML5 data-* attribute.
 * 
 * @function NodeCollection.prototype.data
 * @param {String} key - The name of the stored data.
 * @returns {String} The value of the stored data.
 */
/**
 * Stores arbitrary data associated with each element in the collection.
 * 
 * @function NodeCollection.prototype.data
 * @param {String} key - A string naming the data to set.
 * @param {*} value - Any arbitrary data to store.
 */
/**
 * Stores arbitrary data associated with each element in the collection
 * 
 * @function NodeCollection.prototype.data
 * @param {Object} obj - An object of key-value pairs to add to each elements stored data.
 */
NodeCollectionPrototype.data = getFirstSetEachElement('_data', function(numArgs, firstArg) {
	return !numArgs || numArgs < 2 && typeofString(firstArg);
});

/**
 * Removes all child nodes from each element in the list.
 * 
 * @function NodeCollection.prototype.empty
 */
NodeCollectionPrototype.empty = callOnEachElement('empty');

/**
 * Creates a new NodeCollection containing only the elements that match the provided selector.
 * (If you want to filter against another set of elements, use the {@linkcode Array#intersect|intersect} function.)
 * 
 * @function NodeCollection.prototype.filter
 * @param {String} selector - CSS selector string to match the current collection of elements against.
 * @returns {NodeCollection}
 */
/**
 * Creates a new NodeCollection with all nodes that pass the test implemented by the provided function.
 * (If you want to filter against another set of elements, use the {@linkcode Array#intersect|intersect} function.)
 * 
 * @function NodeCollection.prototype.filter
 * @param {Function} function(value, index, collection) - A function used as a test for each element in the collection.
 * @returns {NodeCollection}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter|Array.prototype.filter() - JavaScript | MDN}
 */
NodeCollectionPrototype.filter = function(selector) {
	return new NodeCollection(arrayFilter.call(this, 
		typeofString(selector)
			? function(node) { return node.nodeType === 1 && node.matches(selector); } //Use CSS string filter
			: selector //Use given filter function
	));
};

/**
 * Hides each element in the collection.
 * 
 * @function NodeCollection.prototype.hide
 * @see HTMLElement#hide
 */
NodeCollectionPrototype.hide = callOnEachElement('hide');

/**
 * Gets the inner HTML of the first element in the list.
 * 
 * @function NodeCollection.prototype.html
 * @returns {String} The element's inner HTML.
 */
/**
 * Sets the inner HTML of each element in the list.
 * 
 * @function NodeCollection.prototype.html
 * @param {String} innerHTML - An HTML string.
 */
NodeCollectionPrototype.html = getFirstSetEachElement('html', function(numArgs) {
	return !numArgs;
});

/**
 * Alias of {@link NodeCollection#putAfter} provided for similarity with jQuery.
 * 
 * @function NodeCollection.prototype.insertAfter
 * @see NodeCollection#putAfter
 */

/**
 * Alias of {@link NodeCollection#putBefore} provided for similarity with jQuery.
 * 
 * @function NodeCollection.prototype.insertBefore
 * @see NodeCollection#putBefore
 */

/*
 * See Array.prototype.map - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map
 */
NodeCollectionPrototype.map = function(callback, thisArg) {
	return new NodeCollection(ArrayPrototype.map.call(this, callback, thisArg));
}

/**
 * Alias of {@link NodeCollection#prependWith} provided for similarity with jQuery.  
 * Note that Firebolt does not define a method called "prepend" for Nodes. This is because the DOM Living Standard has defined
 * a native function called `prepend` for the {@link http://dom.spec.whatwg.org/#interface-parentnode|ParentNode Interface} that
 * does not function in the same way as `prependWith`.
 * 
 * @function NodeCollection.prototype.prepend
 * @see NodeCollection#prependWith
 */
/**
 * Prepends content to the beginning of each element in the collection.
 * 
 * @function NodeCollection.prototype.prependWith
 * @param {...(String|Node|NodeCollection)} content - One or more HTML strings, nodes, or collections of nodes to insert.
 * @throws {HierarchyRequestError} The nodes in the collection must implement the {@link ParentNoded} interface.
 */
NodeCollectionPrototype.prependWith = NodeCollectionPrototype.prepend = function() {
	var len = this.length,
		firstNode = this[0];
	if (len > 1) {
		var fragment = createFragment(arguments),
			i = 1;
		for (; i < len; i++) {
			prepend(fragment.cloneNode(true), this[i]);
		}
		prepend(fragment, firstNode);
	}
	else if (len) { //Only one element to append to
		firstNode.prependWith.apply(firstNode, arguments);
	}

	return this;
}

/**
 * Prepends each node in this collection to the beginning of the specified target(s).
 * 
 * @function NodeCollection.prototype.prependTo
 * @param {String|ParentNode|NodeCollection} target - A specific node, collection of nodes, or a selector to find a set of nodes to which each node will be prepended.
 * @throws {HierarchyRequestError} The target(s) must implement the {@link ParentNode} interface.
 */
NodeCollectionPrototype.prependTo = getPutOrToFunction('prependWith');

/**
 * Gets the value of the specified property of the first element in the list.
 * 
 * @function NodeCollection.prototype.prop
 * @param {String} property - The name of the property who's value you want to get.
 * @returns {?} The value of the property being retrieved.
 */
/**
 * Sets the specified property for each element in the list.
 * 
 * @function NodeCollection.prototype.prop
 * @param {String} property - The name of the property to be set.
 * @param {*} value - The value to set the property to.
 */
/**
 * Sets the specified properties of each element in the list.
 * 
 * @function NodeCollection.prototype.prop
 * @param {Object} properties - An object of property-value pairs to set.
 */
NodeCollectionPrototype.prop = getFirstSetEachElement('prop', function(numArgs, firstArg) {
	return numArgs < 2 && typeofString(firstArg);
});

/**
 * Inserts each node in this collection directly after the specified target(s).
 * 
 * @function NodeCollection.prototype.putAfter
 * @param {String|Node|NodeCollection} target - A specific node, collection of nodes, or a selector to find a set of nodes after which each node will be inserted.
 * @throws {TypeError} The target node(s) must have a {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.parentNode|ParentNode}.
 */
NodeCollectionPrototype.putAfter = NodeCollectionPrototype.insertAfter = getPutOrToFunction('afterPut');

/**
 * Inserts each node in this collection directly before the specified target(s).
 * 
 * @function NodeCollection.prototype.insertBefore
 * @param {String|Node|NodeCollection} target - A specific node, collection of nodes, or a selector to find a set of nodes before which each node will be inserted.
 * @throws {TypeError} The target node(s) must have a {@link https://developer.mozilla.org/en-US/docs/Web/API/Node.parentNode|ParentNode}.
 */
NodeCollectionPrototype.putBefore = NodeCollectionPrototype.insertBefore = getPutOrToFunction('beforePut');

/**
 * Removes nodes in the collection from the DOM tree.
 * 
 * @function NodeCollection.prototype.remove
 * @param {String} [selector] - A selector that filters the set of elements to be removed.
 */
NodeCollectionPrototype.remove = function(selector) {
	var nodes = selector ? this.filter(selector) : this,
		i = 0;
	for (; i < nodes.length; i++) {
		nodes[i].remove();
	}

	return this;
};

/**
 * Removes the specified attribute from each element in the list.
 * 
 * @function NodeCollection.prototype.removeAttr
 * @param {String} attribute - The name of the attribute to be removed.
 */
NodeCollectionPrototype.removeAttr = callOnEachElement('removeAttr');

/**
 * Removes the input class name from all elements in the list.
 * 
 * @function NodeCollection.prototype.removeClass
 * @param {String} className - The class to be removed from each element in the collection.
 */
NodeCollectionPrototype.removeClass = callOnEachElement('removeClass');

/**
 * Removes a previously stored piece of Firebolt data from each element.  
 * When called without any arguments, all data is removed.
 * 
 * @function NodeCollection.prototype.removeData
 * @param {String} [name] - The name of the data to remove.
 */
/**
 * Removes previously stored Firebolt data from each element.  
 * When called without any arguments, all data is removed.
 * 
 * @function NodeCollection.prototype.removeData
 * @param {Array|String} [list] - An array or space-separated string naming the pieces of data to remove.
 */
NodeCollectionPrototype.removeData = callOnEachElement('removeData');

/**
 * Removes the specified property from each element in the list.
 * 
 * @function NodeCollection.prototype.removeProp
 * @param {String} property - The name of the property to remove.
 */
NodeCollectionPrototype.removeProp = callOnEachElement('removeProp');

/**
 * Shows each element in the set. For specifics, see {@link HTMLElement#show}.
 * 
 * @function NodeCollection.prototype.show
 * @param {Number|String} [style] - The style of display the element should be shown with.
 * @see HTMLElement.show
 */
NodeCollectionPrototype.show = callOnEachElement('show');

/*
 * See Array.prototype.slice
 */
NodeCollectionPrototype.slice = function(start, end) {
	return new NodeCollection(ArrayPrototype.slice.call(this, start, end));
}

/**
 * Gets the combined text contents of each node in the list.
 * 
 * @function NodeCollection.prototype.text
 * @returns {String} The node's text content.
 */
/**
 * Sets the text content of each node in the list.
 * 
 * @function NodeCollection.prototype.text
 * @param {String|*} text - The text or content that will be converted to a string to be set as each nodes' text content.
 */
NodeCollectionPrototype.text = function(text) {
	var len = this.length,
		i = 0;
	//Get
	if (isUndefined(text)) {
		for (text = ''; i < len; i++) {
			text += this[i].textContent;
		}
		return text;
	}
	//Set
	for (; i < len; i++) {
		this[i].textContent = text;
	}

	return this;
};

/**
 * Toggles the input class name for all elements in the list.
 * 
 * @function NodeCollection.prototype.toggleClass
 * @param {String} className - The class to be toggled for each element in the collection.
 */
NodeCollectionPrototype.toggleClass = callOnEachElement('toggleClass');

//#endregion NodeCollection


//#region =========================== NodeList ===============================

/**
 * @classdesc
 * The HTML DOM NodeList interface. This is the main object returned by {@link Firebolt#Firebolt|Firebolt}.  
 *   
 * Represents a collection of DOM Nodes. NodeLists have almost the exact same API as {@link NodeCollection}.  
 * However, unlike NodeCollections, NodeLists are immutable and therefore do not have any of the following functions:
 * 
 * + clear
 * + pop
 * + push
 * + reverse
 * + shift
 * + splice
 * + unshift
 * 
 * If you want to manipulate a NodeList using these functions, you must retrieve it as a NodeCollection by
 * calling {@linkcode NodeList#toNC|toNC()} on the NodeList.
 * 
 * Also note that the following functions return the NodeCollection equivalent of the NodeList instead of
 * the NodeList itself:
 * 
 * + afterPut/after
 * + appendWith/append
 * + appendTo
 * + beforePut/before
 * + putAfter/insertAfter
 * + putBefore/insertBefore
 * + prependWith/prepend
 * + prependTo
 * + remove
 * + removeClass
 * + toggleClass
 * 
 * This is because the functions my alter live NodeLists, as seen in this example:
 * 
 * ```JavaScript
 * var $blueThings = $CLS('blue');
 * $blueThings.length = 10;  // for example
 * $blueThings.removeClass('blue'); // returns $blueThings as a NodeCollection
 * $blueThings.length === 0; // true - since now there are no elements with the 'blue' class
 * ```
 * 
 * Returning a NodeCollection allows for correct functionality when chaining calls originally made on a NodeList,
 * but be aware that a live NodeList saved as a variable may be altered by these functions.
 * 
 * Finally, since it is not possible to manually create a new NodeList in JavaScript (there are tricks but
 * they are slow and not worth it), the following functions return a NodeCollection instead of a NodeList:
 * 
 * + add
 * + clean
 * + clone
 * + concat
 * + filter
 * + intersect
 * + map
 * + slice
 * + union
 * + unique
 * + without
 * 
 * This, however, should not be worrisome since NodeCollections have all of the same functions as NodeLists
 * with the added benefits of being mutable and static (not live).  
 * <br />
 * 
 * @class NodeList
 * @see NodeCollection
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/NodeList|NodeList - Web API Interfaces | MDN}
 */

/* Give NodeLists and HTMLCollections many of the same prototype functions as NodeCollections */
getOwnPropertyNames(NodeCollectionPrototype)
	.union(getOwnPropertyNames(ArrayPrototype))
	.remove( //These methods should not be added to the NodeList prototype
		'clear',
		'length',
		'pop',
		'push',
		'reverse',
		'shift',
		'splice',
		'unshift'
	).forEach(function(methodName) {
		if (rgxDifferentNL.test(methodName)) { //Convert to a NodeCollection first
			HTMLCollectionPrototype[methodName] = NodeListPrototype[methodName] = function() {
				return NodeCollectionPrototype[methodName].apply(new NodeCollection(this), arguments);
			}
		}
		else if (!NodeListPrototype[methodName]) {
			HTMLCollectionPrototype[methodName] = NodeListPrototype[methodName] = NodeCollectionPrototype[methodName];
		}
	});

/**
 * Returns the NodeCollection equivalent of the NodeList.
 * 
 * @function NodeList.prototype.toNC
 * @returns {NodeCollection}
 */
NodeListPrototype.toNC = HTMLCollectionPrototype.toNC =

/* HTMLCollections are always clean (since they can only contain HTMLElements) */
HTMLCollectionPrototype.clean =

/* NodeLists/HTMLCollections always contain unique elements */
NodeListPrototype.unique = HTMLCollectionPrototype.unique =

/* All of the above functions are equivalent to calling NodeCollection#clone() on the NodeList/HTMLCollection */
NodeCollectionPrototype.clone;

//#endregion NodeList


//#region ============================ Number ================================

/**
 * @class Number
 * @classdesc The JavaScript Number object.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number|Number - JavaScript | MDN}
 */

/**
 * Returns a string representation of the number padded with leading 0s so that the string's length is at least equal to length.
 * Takes an optional radix argument which specifies the base to use for conversion.
 * 
 * @function Number.prototype.toPaddedString
 * @param {Number} length - The minimum length for the resulting string.
 * @param {Number} [radix=10] - Defines which base to use for representing the numeric value. Must be an integer between 2 and 36.
 * @example
 * (255).toPaddedString(4);     // "0255"
 * (255).toPaddedString(4, 16); // "00ff"
 * (25589).toPaddedString(4);   // "25589"
 * (3).toPaddedString(5, 2);    // "00011"
 * (-3).toPaddedString(5, 2);   // "-0011"
 */
Number[prototype].toPaddedString = function(length, radix) {
	var sNumber = this.toString(radix);
	if (length > sNumber.length) {
		sNumber = '0'.repeat(length - sNumber.length) + sNumber;
	}
	return this < 0 ? '-' + sNumber.replace('-', '') : sNumber;
}; 

//#endregion Number


//#region ============================ Object ================================

/**
 * @class Object
 * @classdesc The JavaScript Object class.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object|Object - JavaScript | MDN}
 */

defineProperties(Object[prototype], {
	/**
	 * Gets the object's stored data object.
	 * 
	 * @function Object.prototype._data
	 * @returns {Object} The object's stored data object.
	 */
	/**
	 * Get the value at the named data store for the object as set by ._data(name, value)
	 * or by an HTML5 data-* attribute if the object is an {@link Element}.
	 * 
	 * @function Object.prototype._data
	 * @param {String} key - The name of the stored data.
	 * @returns {*} The value of the stored data.
	 */
	/**
	 * Stores arbitrary data associated with the object.
	 * 
	 * @function Object.prototype._data
	 * @param {String} key - A string naming the data to set.
	 * @param {*} value - Any arbitrary data to store.
	 */
	/**
	 * Stores arbitrary data associated with the object.
	 * 
	 * @function Object.prototype._data
	 * @param {Object} obj - An object of key-value pairs to add to the object's stored data.
	 */
	_data: {
		value: function(key, value) {
			return data(dataKeyPublic, this, key, value);
		}
	},

	/**
	 * Determines if the object has any Firebolt data associated with it.
	 * 
	 * @function Object.prototype.hasData
	 * @returns {Boolean} `true` if the object has stored Firebolt data; else `false`.
	 */
	hasData: {
		value: function() {
			return !isEmptyObject(this[dataKeyPublic]);
		}
	},

	/**
	 * Removes a previously stored piece of Firebolt data.  
	 * When called without any arguments, all data is removed.
	 * 
	 * @function Object.prototype.removeData
	 * @param {String} [name] - The name of the data to remove.
	 */
	/**
	 * Removes previously stored Firebolt data.  
	 * When called without any arguments, all data is removed.
	 * 
	 * @function Object.prototype.removeData
	 * @param {Array|String} [list] - An array or space-separated string naming the pieces of data to remove.
	 */
	removeData: {
		value: function(input) {
			if (isUndefined(input)) {
				this[dataKeyPublic] = {};
			}
			else {
				if (typeofString(input)) {
					input = input.split(' ');
				}
				for (var i = 0; i < input.length; i++) {
					delete this[dataKeyPublic][input[i]];
				}
			}

			return this;
		}
	}
});

//#endregion Object


//#region ============================ String ================================

/**
 * @class String
 * @classdesc The JavaScript String object.
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String|String - JavaScript | MDN}
 */

if (!StringPrototype.contains) {
	/**
	 * Determines whether the passed in string is in the current string.
	 *
	 * @function String.prototype.contains
	 * @param {String} searchString - The string to be searched for.
	 * @param {Number} [position=0] - The position in this string at which to begin the search.
	 * @returns {Boolean} `true` if this string contains the search string; else `false`.
	 * @example
	 * var str = "Winter is coming.";
	 * alert( str.contains(" is ") );    // true
	 * alert( str.contains("summer") );  // false
	 */
	defineProperty(StringPrototype, 'contains', {
		value: function(searchString, position) {
			return this.indexOf(searchString, position) >= 0;
		}
	});
}

if (!StringPrototype.endsWith) {
	/**
	 * Determines whether a string ends with the characters of another string.
	 *
	 * @function String.prototype.endsWith
	 * @param {String} searchString - The characters to be searched for at the end of this string.
	 * @param {Number} [position=this.length] - Search within this string as if this string were only this long; clamped within the range established by this string's length.
	 * @returns {Boolean} `true` if this string ends with `searchString`; else `false`.
	 * @example
	 * var str = "Who am I, Gamling?";
	 * alert( str.endsWith("Gamling?") );  // true
	 * alert( str.endsWith("am I") );      // false
	 * alert( str.endsWith("am I", 8) );   // true
	 */
	defineProperty(StringPrototype, 'endsWith', {
		value: function(searchString, position) {
			position = (!isUndefined(position) && position < this.length ? position : this.length) - searchString.length;
			return position >= 0 && this.indexOf(searchString, position) === position;
		}
	});
}

if (!StringPrototype.repeat) {
	/**
	 * Copies the current string a given number of times and returns the new string.
	 *
	 * @function String.prototype.repeat
	 * @param {Number} count - An integer between 0 and +∞ : [0, +∞).
	 * @returns {String}
	 * @throws {RangeError} The repeat count must be positive and less than infinity.
	 * @example
	 * "abc".repeat(0)   // ""
	 * "abc".repeat(1)   // "abc"
	 * "abc".repeat(2)   // "abcabc"
	 * "abc".repeat(3.5) // "abcabcabc" (count will be converted to integer)
	 * "0".repeat(5)     // "00000"
	 */
	defineProperty(StringPrototype, 'repeat', {
		value: function(count) {
			count = parseInt(count || 0);
			if (isNaN(count) || count < 0) {
				throw new RangeError('The repeat count must be positive and less than infinity.');
			}
			for (var str = '', i = 0; i < count; i++) {
				str += this;
			}
			return str;
		}
	});
}

if (!StringPrototype.startsWith) {
	/**
	 * Determines whether a string starts with the characters of another string.
	 *
	 * @function String.prototype.startsWith
	 * @param {String} searchString - The characters to be searched for at the start of this string.
	 * @param {Number} [position=0] - The position in this string at which to begin searching for `searchString`.
	 * @returns {Boolean} `true` if this string starts with the search string; else `false`.
	 * @example
	 * var str = "Who am I, Gamling?";
	 * alert( str.endsWith("Who") );      // true
	 * alert( str.endsWith("am I") );     // false
	 * alert( str.endsWith("am I", 4) );  // true
	 */
	defineProperty(StringPrototype, 'startsWith', {
		value: function(searchString, position) {
			position = position || 0;
			return this.lastIndexOf(searchString, position) === position;
		}
	});
}

defineProperties(StringPrototype, {
	/**
	 * Returns the string split into an array of substrings (tokens) that were separated by white-space.
	 *
	 * @function String.prototype.tokenize
	 * @returns {String[]} An array of tokens.
	 * @example
	 * var str = "The boy who lived.";
	 * str.tokenize();  // returns ["The", "boy", "who", "lived."]
	 */
	tokenize: {
		value: function() {
			return this.match(rgxNonWhitespace) || [];
		}
	},

	/**
	 * Appends query string parameters to a URL.
	 *
	 * @function String.prototype.URLAppend
	 * @param {String} params - Query string parameters.
	 * @returns {String} A reference to the string.
	 * @example
	 * var url = "http://google.com";
	 * url = url.URLAppend('lang=en');  // "http://google.com?lang=en"
	 * url = url.URLAppend('foo=bar');  // "http://google.com?lang=en&foo=bar"
	 */
	URLAppend: {
		value: function(params) {
			return this.concat(this.contains('?') ? '&' : '?', params);
		}
	}
});

//#endregion String


//#region ============ Browser Compatibility and Speed Boosters ==============

var isOldIE = createElement('div').html('<!--[if IE]><i></i><![endif]-->').$TAG('i').length > 0,
	isChrome = !!window.chrome && !window.opera,
	isIOS = navigator.platform.startsWith('iP'), // iPhone, iPad, iPod
	noMultiParamClassListFuncs = (function() {
		var elem = createElement('div');
		if (elem.classList) {
			elem.classList.add('one', 'two');
		}
		return elem.className.length !== 7;
	})();

if (isOldIE) {
	/* Make the hasClass() function compatible with IE9 */
	HTMLElementPrototype.hasClass = function(className) {
		return new RegExp('(?:^|\\s)' + className + '(?:\\s|$)').test(this.className);
	};
}

/* Browser (definitely IE) compatibility and Chrome speed boost for removeClass() */
if (isChrome || noMultiParamClassListFuncs) {
	HTMLElementPrototype.removeClass = function(value) {
		if (isUndefined(value)) {
			this.className = ''; //Remove all classes
		}
		else {
			var remClasses = value.split(' '),
				curClasses = this.className.split(rgxSpaceChars),
				newClassName = '',
				i = 0;
			for (; i < curClasses.length; i++) {
				if (curClasses[i] && remClasses.indexOf(curClasses[i]) < 0) {
					newClassName += (newClassName ? ' ' : '') + curClasses[i];
				}
			}
			//Only assign if the new class name is different (shorter) to avoid unnecessary rendering
			if (newClassName.length < this.className.length) {
				this.className = newClassName;
			}
		}

		return this;
	};
}

if (isChrome || isIOS) {
	window.$1 = function(selector) {
		if (selector[0] !== '#') { //Filter out selection by ID
			if (selector[0] === '.') { //Check for a single class name
				if (rgxClassOrId.test(selector)) {
					return document.getElementsByClassName(selector.slice(1))[0];
				}
			}
			else if (rgxTag.test(selector)) { //Check for a single tag name
				return document.getElementsByTagName(selector)[0];
			}
		}
		return document.querySelector(selector);
	};
}

//#endregion Browser Compatibility and Speed Boosters

})(window, document);


//#region ============================ Timer =================================

/**
 * @class
 * @example
 * // HTML
 * <div id="display">0</div>
 * 
 * // JavaScript
 * var seconds = 0,
 *     counter = new Timer(function() {
 *         seconds++;
 *         $ID('display').text(seconds);
 *     }, 1000).start();
 */
function Timer(callback, interval, onstart, onstop) {
	// Private
	var _clearRef,
		_isRunning = false,
		_this = this;

	// Public
	_this.callback = callback;

	_this.interval = interval;

	_this.onstart = onstart;

	_this.onstop = onstop;

	_this.isRunning = function() {
		return _isRunning;
	};

	_this.start = function() {
		if (!_isRunning) {
			_clearRef = setInterval(function() {
				_this.callback();
			}, interval);
			_isRunning = true;
			if (_this.onstart) {
				_this.onstart();
			}
		}
		return _this;
	};

	_this.stop = function() {
		if (_isRunning) {
			clearInterval(_clearRef);
			_isRunning = false;
			if (_this.onstop) {
				_this.onstop();
			}
		}
		return _this;
	};
}

//#endregion Timer
