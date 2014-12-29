﻿/**
 * Unit tests for Element.prototype
 */

// References for Resharper
/// <reference path="../qunit/qunit.js"/>
/// <reference path="../../src/firebolt.js"/>

QUnit.module('Element.prototype');

QUnit.test('CLS', function(assert) {
	assert.strictEqual(Element.prototype.CLS, Element.prototype.getElementsByClassName,
		'Has the `getElementsByClassName()` alias function.');
});

QUnit.test('TAG', function(assert) {
	assert.strictEqual(Element.prototype.TAG, Element.prototype.getElementsByTagName,
		'Has the `getElementsByTagName()` alias function.');
});

QUnit.test('QS', function(assert) {
	assert.strictEqual(Element.prototype.QS, Element.prototype.querySelector,
		'Has the `querySelector()` alias function.');
});

QUnit.test('QSA', function(assert) {
	assert.strictEqual(Element.prototype.QSA, Element.prototype.querySelectorAll,
		'Has the `querySelectorAll()` alias function.');
});

QUnit.test('attr', function(assert) {
	var el = document.createElement('div');

	assert.equal(el.attr('data-test', 'a'), el, 'Returns the element when setting a single attribute.');
	assert.strictEqual(el.getAttribute('data-test'), 'a', 'Sets a single attribute wth the specified name.');
	assert.strictEqual(el.attr('data-test'), 'a', 'Returns a single attribute with the specified name.');

	assert.strictEqual(el.attr('nope'), null, 'Returns null when getting a non-existant attribute.');

	assert.equal(el.attr({'data-a': 'a', 'data-b': 'b', 'data-c': 'c'}), el,
		'Returns the element when setting multiple properties.');
	assert.ok(el.getAttribute('data-a') === 'a' && el.getAttribute('data-b') === 'b' && el.getAttribute('data-c') === 'c',
		'Sets multiple attributes when passed in an object of key-value pairs.');

	el.attr('data-a', null);
	assert.ok(!el.hasAttribute('data-a'), 'Removes an attribute if attempting to set it to null.');

	el.attr('data-b', undefined);
	assert.ok(!el.hasAttribute('data-b'), 'Removes an attribute if attempting to set it to undefined.');

	el.attr({'data-c': null, 'data-test': undefined});
	assert.ok(!el.hasAttribute('data-c'),
		'Removes an attribute if attempting to set it to null when setting multiple attributes.');
	assert.ok(!el.hasAttribute('data-test'),
		'Removes an attribute if attempting to set it to undefined when setting multiple attributes.');
});

QUnit.test('data', function(assert) {
	var el = document.createElement('div'),
		key = 'key',
		value = 'value',
		data = Firebolt.data;

	// Spy on Firebolt.data()
	Firebolt.data = function(_obj, _key, _value, _isElement) {
		assert.strictEqual(_obj, el);
		assert.strictEqual(_key, key);
		assert.strictEqual(_value, value);
		assert.strictEqual(_isElement, 1);

		return 'retVal';
	};

	assert.strictEqual(el.data(key, value), 'retVal', 'Returns what Firebolt.data() returns.');

	// Restore the function
	Firebolt.data = data;
});

QUnit.test('find', function(assert) {
	assert.expect(4);

	var div = document.createElement('div'),
		span = document.createElement('span');

	div.appendChild(span);
	div.id = 'testId1'; // Set the id to make sure .find() doesn't alter it

	assert.strictEqual(div.find('div span').length, 0,
		'Does not find elements that match the selector but do not match from the root element.');

	assert.strictEqual(div.find('span')[0], span,
		'Finds elements that match the selector from the root element.');

	assert.strictEqual(div.id, 'testId1', "Does not alter the element's id property.");

	div.id = 'testId2'; // Set the id to make sure .find() doesn't alter it if an error occurs
	try {
		div.find('&');
	}
	catch (e) {
		assert.strictEqual(div.id, 'testId2', "Does not alter the element's id property when an error occurs.");
	} 
});

QUnit.test('matches', function(assert) {
	if (document.getElementById('qunit-fixture').appendChild(document.createElement('iframe')).contentWindow.Element.prototype.matches) {
		// Element.prototype.matches is natively supported
		assert.ok(typeof Element.prototype.matches == 'function', 'Has the `matches()` function.');
	}
	else {
		assert.strictEqual(
			Element.prototype.matches,
			Element.prototype.webkitMatchesSelector || Element.prototype.mozMatchesSelector || Element.prototype.msMatchesSelector || Element.prototype.oMatchesSelector,
			'Has the `matches()` function.'
		);
	}
});

QUnit.test('prop', function(assert) {
	var el = document.createElement('div');

	assert.strictEqual(el.prop('testProp', 1), el, 'Returns the element when setting a single property.');
	assert.strictEqual(el.testProp, 1, 'Sets a single property at the specified key.');
	assert.strictEqual(el.prop('testProp'), 1, 'Returns a single property at the specified key.');

	assert.strictEqual(el.prop({p1: 1, p2: 2}), el, 'Returns the element when setting multiple properties.');
	assert.ok(el.p1 === 1 && el.p2 === 2, 'Sets multiple properties when passed in an object of key-value pairs.');
});

QUnit.test('removeAttr', function(assert) {
	var el = document.createElement('div');
	el.setAttribute('class', 'mydiv');

	assert.strictEqual(el.removeAttr('class'), el, 'Returns the element.');
	assert.strictEqual(el.getAttribute('class'), null, 'Successfully removes the attribute from the element.');
});

QUnit.test('removeData', function(assert) {
	var el = document.createElement('div'),
		key = 'key',
		removeData = Firebolt.removeData;

	// Spy on Firebolt.removeData()
	Firebolt.removeData = function(_obj, _key) {
		assert.strictEqual(_obj, el);
		assert.strictEqual(_key, key);
	};

	assert.strictEqual(el.removeData(key), el, 'Returns the element.');

	// Restore the function
	Firebolt.removeData = removeData;
});

QUnit.test('removeProp', function(assert) {
	var el = document.createElement('div');
	el.testProp = 1;

	assert.strictEqual(el.removeProp('testProp'), el, 'Returns the element.');
	assert.strictEqual(el.testProp, undefined, 'Successfully removes the property from the element.');
});
