import * as assert from 'assert';

import { createExcludeList } from '../../utils';

suite('Extension Test Suite', () => {
    test('createExcludeList excludes strict prefix siblings', () => {
        const excludes = createExcludeList('.vscode');

        assert.ok(excludes.includes('.vs'));
        assert.ok(excludes.includes('.vs/**'));
    });

    test('createExcludeList excludes longer same-prefix siblings', () => {
        const excludes = createExcludeList('.vscode');

        assert.ok(excludes.includes('.vscode[!/]*/**'));
    });

    test('createExcludeList escapes glob metacharacters', () => {
        const excludes = createExcludeList('a[b]/c*d');

        assert.ok(excludes.some(pattern => pattern.startsWith('a\\[b\\]/')));
        assert.ok(excludes.includes('a\\[b\\]/c\\*d[!/]*/**'));
    });
});
