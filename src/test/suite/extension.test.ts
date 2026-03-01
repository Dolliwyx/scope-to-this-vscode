import * as assert from 'assert';

import {
    collapseNestedPaths,
    createExcludeListForSelections,
    createExcludeListForSiblings
} from '../../utils';

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

    test('collapseNestedPaths removes nested and duplicate paths', () => {
        const collapsed = collapseNestedPaths([
            'folderA',
            'folderA/child',
            'folderB',
            'folderB',
            'folderC/child/grandChild',
            'folderC/child'
        ]);

        assert.deepStrictEqual(collapsed, ['folderA', 'folderB', 'folderC/child']);
    });

    test('collapseNestedPaths treats root as highest priority', () => {
        const collapsed = collapseNestedPaths(['folderA', '', 'folderA/child']);
        assert.deepStrictEqual(collapsed, ['']);
    });

    test('createExcludeListForSelections supports multiple top-level selections', async () => {
        const excludes = await createExcludeListForSelections(
            ['folderA', 'folderB'],
            async currentPath => {
                if (currentPath.length === 0) {
                    return ['folderA', 'folderB', 'folderC'];
                }

                return [];
            }
        );

        assert.ok(excludes.includes('folderC'));
        assert.ok(excludes.includes('folderC/**'));
        assert.ok(!excludes.includes('folderA'));
        assert.ok(!excludes.includes('folderB/**'));
    });

    test('createExcludeListForSelections supports siblings under same parent', async () => {
        const excludes = await createExcludeListForSelections(
            ['folderA/child1', 'folderA/child2'],
            async currentPath => {
                if (currentPath.length === 0) {
                    return ['folderA', 'folderB'];
                }

                if (currentPath.join('/') === 'folderA') {
                    return ['child1', 'child2', 'child3'];
                }

                return [];
            }
        );

        assert.ok(excludes.includes('folderB'));
        assert.ok(excludes.includes('folderA/child3/**'));
        assert.ok(!excludes.includes('folderA/child1'));
        assert.ok(!excludes.includes('folderA/child2/**'));
    });
});
