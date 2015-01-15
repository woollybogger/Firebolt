/**
 * Unit tests for NodeList.prototype
 */

// References for Resharper
/// <reference path="../node_modules/qunitjs/qunit/qunit.js"/>
/// <reference path="../../src/firebolt.js"/>

QUnit.module('NodeList.prototype');

QUnit.test('has correct functions', function(assert) {
	var differentFuncs = [
			'afterPut', 'after',
			'appendWith', 'append',
			'appendTo',
			'beforePut', 'before',
			'concat',
			'copyWithin',
			'each',
			'fill',
			'prependWith', 'prepend',
			'prependTo',
			'putAfter', 'insertAfter',
			'putBefore', 'insertBefore',
			'remove',
			'removeClass',
			'replaceAll',
			'replaceWith',
			'reverse',
			'sort',
			'toggleClass',
			'unwrap',
			'wrapInner',
			'wrapWith', 'wrap'
		];

	Object.keys(NodeList.prototype)
		.diff(['item', 'namedItem', 'uniq', 'length', '@@iterator'])
		.forEach(function(methodName) {
			if (differentFuncs.indexOf(methodName) >= 0) {
				assert.notEqual(NodeList.prototype[methodName], NodeCollection.prototype[methodName],
					'NodeList.prototype.' + methodName + ' != NodeCollection.prototype.' + methodName);
			} else {
				assert.equal(NodeList.prototype[methodName], NodeCollection.prototype[methodName],
					'NodeList.prototype.' + methodName + ' == NodeCollection.prototype.' + methodName);
			}

			assert.equal(HTMLCollection.prototype[methodName], NodeList.prototype[methodName],
				'HTMLCollection.prototype.' + methodName + ' == NodeList.prototype.' + methodName);
		});

	assert.equal(NodeList.prototype.namedItem, NodeCollection.prototype.namedItem,
		'NodeList.prototype.namedItem == NodeCollection.prototype.namedItem');

	assert.notEqual(HTMLCollection.prototype.namedItem, NodeList.prototype.namedItem,
		'HTMLCollection.prototype.namedItem != NodeList.prototype.namedItem');

	assert.equal(NodeList.prototype.uniq, NodeCollection.prototype.toNC,
		'NodeList.prototype.uniq == NodeCollection.prototype.toNC');
});