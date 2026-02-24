import * as assert from 'assert';

import { createExcludeListForSiblings } from '../../utils';

suite('Extension Test Suite', () => {
    test('createExcludeListForSiblings excludes strict prefix siblings', () => {
        const excludes = createExcludeListForSiblings('.vscode', [['.vscode', '.vs', '.vscodeignore']]);

        assert.ok(excludes.includes('.vs'));
        assert.ok(excludes.includes('.vs/**'));
    });

    test('createExcludeListForSiblings excludes longer same-prefix siblings', () => {
        const excludes = createExcludeListForSiblings('.vscode', [['.vscode', '.vscodeignore']]);

        assert.ok(excludes.includes('.vscodeignore'));
        assert.ok(excludes.includes('.vscodeignore/**'));
    });

    test('createExcludeListForSiblings keeps selected subtree visible', () => {
        const excludes = createExcludeListForSiblings('folderA/folderB', [
            ['folderA', 'anotherRoot'],
            ['folderB', 'fileA', 'folderC']
        ]);

        assert.ok(excludes.includes('anotherRoot'));
        assert.ok(excludes.includes('anotherRoot/**'));
        assert.ok(excludes.includes('folderA/fileA'));
        assert.ok(excludes.includes('folderA/folderC/**'));
        assert.ok(!excludes.includes('folderA'));
        assert.ok(!excludes.includes('folderA/folderB'));
    });

    test('createExcludeListForSiblings escapes glob metacharacters', () => {
        const excludes = createExcludeListForSiblings('a[b]/c*d', [
            ['a[b]', 'a*b'],
            ['c*d', 'c?d']
        ]);

        assert.ok(excludes.includes('a\\*b'));
        assert.ok(excludes.includes('a\\[b\\]/c\\?d/**'));
    });
});
