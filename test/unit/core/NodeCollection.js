﻿QUnit.module('core/NodeCollection');

QUnit.test('#toArray', function(assert) {
  assert.expect(2);

  var nc = Firebolt('div');
  var array = nc.toArray();

  assert.ok(Array.isArray(array) && (array instanceof Array), 'Returns a true Array.');

  assert.deepEqual(nc, array, 'Contains the exact same items as the original collection.');
});
