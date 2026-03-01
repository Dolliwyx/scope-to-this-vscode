import * as vscode from 'vscode';

type ExcludeObject = { [key: string]: boolean | undefined };
type StringListMap = { [workspaceKey: string]: string[] };

type WorkspaceAndPath = {
    workspace: vscode.WorkspaceFolder;
    relativePath: string;
};

type SelectionNode = {
    terminal: boolean;
    children: Map<string, SelectionNode>;
};

const KEY_SELECTED_PATHS = 'scopeToThis.selectedPathsByWorkspace';
const KEY_MANAGED_EXCLUDES = 'scopeToThis.managedExcludesByWorkspace';

const KEY_CURRENT_SCOPE = 'scopeToThis.currentScope';
const KEY_CURRENT_EXCLUDES = 'scopeToThis.currentExcludes';
const CONTEXT_IS_SCOPED = 'scopeToThis.scoped';

let vscodeContext: vscode.ExtensionContext | null = null;

export async function initContext(context: vscode.ExtensionContext) {
    vscodeContext = context;

    await migrateLegacyState();

    const selectedPaths = getStateMap(KEY_SELECTED_PATHS);
    await setScopedContext(hasActiveScopes(selectedPaths));
}

export async function scopeToThis(path: vscode.Uri) {
    await scopeToThese([path]);
}

export async function scopeToThese(paths: vscode.Uri[]) {
    try {
        if (!paths.length) {
            return;
        }

        const grouped = groupPathsByWorkspace(paths);
        if (grouped.size === 0) {
            vscode.window.showInformationMessage('Select a workspace folder to scope.');
            return;
        }

        const selectedByWorkspace = getStateMap(KEY_SELECTED_PATHS);
        const managedByWorkspace = getStateMap(KEY_MANAGED_EXCLUDES);

        for (const [workspaceKey, groupedPaths] of grouped.entries()) {
            const existing = selectedByWorkspace[workspaceKey] || [];
            const merged = collapseNestedPaths([...existing, ...groupedPaths.paths]);
            const nextSelected = merged.includes('') ? [] : merged;

            const nextManagedCandidates = nextSelected.length > 0
                ? await createExcludeList(nextSelected, groupedPaths.workspace.uri)
                : [];

            const appliedManaged = await applyManagedExcludes(
                groupedPaths.workspace,
                managedByWorkspace[workspaceKey] || [],
                nextManagedCandidates
            );

            if (appliedManaged.length > 0 && nextSelected.length > 0) {
                selectedByWorkspace[workspaceKey] = nextSelected;
                managedByWorkspace[workspaceKey] = appliedManaged;
            } else {
                delete selectedByWorkspace[workspaceKey];
                delete managedByWorkspace[workspaceKey];
            }
        }

        await saveStateMap(KEY_SELECTED_PATHS, selectedByWorkspace);
        await saveStateMap(KEY_MANAGED_EXCLUDES, managedByWorkspace);
        await setScopedContext(hasActiveScopes(selectedByWorkspace));
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}

export async function clearScope() {
    try {
        const managedByWorkspace = getStateMap(KEY_MANAGED_EXCLUDES);
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const workspaceByKey = new Map<string, vscode.WorkspaceFolder>();

        workspaceFolders.forEach(workspace => {
            workspaceByKey.set(getWorkspaceKey(workspace), workspace);
        });

        for (const [workspaceKey, managedExcludes] of Object.entries(managedByWorkspace)) {
            const workspace = workspaceByKey.get(workspaceKey);
            if (!workspace) {
                continue;
            }

            await applyManagedExcludes(workspace, managedExcludes, []);
        }

        await clearLegacyState();
        await saveStateMap(KEY_SELECTED_PATHS, {});
        await saveStateMap(KEY_MANAGED_EXCLUDES, {});
        await setScopedContext(false);
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}

function getWorkspaceAndRelativePath(path: vscode.Uri): WorkspaceAndPath | undefined {
    const workspace = vscode.workspace.getWorkspaceFolder(path);
    if (!workspace) {
        return;
    }

    const relative = normalizeRelativePath(vscode.workspace.asRelativePath(path, false));
    return {
        workspace,
        relativePath: relative
    };
}

function groupPathsByWorkspace(paths: vscode.Uri[]) {
    const grouped = new Map<string, { workspace: vscode.WorkspaceFolder; paths: string[] }>();

    for (const path of paths) {
        const workspaceAndPath = getWorkspaceAndRelativePath(path);
        if (!workspaceAndPath) {
            continue;
        }

        const workspaceKey = getWorkspaceKey(workspaceAndPath.workspace);
        const groupedPaths = grouped.get(workspaceKey);
        if (groupedPaths) {
            groupedPaths.paths.push(workspaceAndPath.relativePath);
            continue;
        }

        grouped.set(workspaceKey, {
            workspace: workspaceAndPath.workspace,
            paths: [workspaceAndPath.relativePath]
        });
    }

    return grouped;
}

function getWorkspaceKey(workspace: vscode.WorkspaceFolder) {
    return workspace.uri.toString();
}

function normalizeRelativePath(path: string) {
    return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function isSameOrDescendant(path: string, possibleParent: string) {
    return path === possibleParent || path.startsWith(`${possibleParent}/`);
}

export function collapseNestedPaths(paths: string[]) {
    const normalizedUnique = [...new Set(paths.map(normalizeRelativePath))];

    if (normalizedUnique.includes('')) {
        return [''];
    }

    normalizedUnique.sort((left, right) => {
        const leftDepth = left.split('/').length;
        const rightDepth = right.split('/').length;

        if (leftDepth !== rightDepth) {
            return leftDepth - rightDepth;
        }

        return left.localeCompare(right);
    });

    const collapsed: string[] = [];

    normalizedUnique.forEach(path => {
        if (collapsed.some(parent => isSameOrDescendant(path, parent))) {
            return;
        }

        collapsed.push(path);
    });

    return collapsed;
}

function escapeGlobSegment(segment: string) {
    return segment.replace(/([\\*?[\]{}()!+@|])/g, '\\$1');
}

function escapeNegatedCharClassChar(char: string) {
    if (char === '\\' || char === ']' || char === '-' || char === '^' || char === '!') {
        return `\\${char}`;
    }

    return char;
}

export function createExcludeListForSiblings(path: string, siblingsByLevel: string[][]) {
    const excludes = new Set<string>();
    const dirs = path.split('/').filter(Boolean);

    dirs.forEach((dir, dirI) => {
        const currentPath = dirs.slice(0, dirI);
        const siblings = siblingsByLevel[dirI] || [];

        siblings.forEach(sibling => {
            if (sibling === dir) {
                return;
            }

            const siblingPath = [...currentPath, sibling].map(escapeGlobSegment).join('/');
            excludes.add(siblingPath);
            excludes.add(`${siblingPath}/**`);
        });
    });

    return [...excludes];
}

export async function createExcludeListForSelections(
    paths: string[],
    readSiblings: (currentPath: string[]) => Promise<string[]>
) {
    const collapsed = collapseNestedPaths(paths);
    if (collapsed.length === 0 || collapsed.includes('')) {
        return [];
    }

    const root: SelectionNode = {
        terminal: false,
        children: new Map<string, SelectionNode>()
    };

    collapsed.forEach(path => {
        const dirs = path.split('/').filter(Boolean);
        let currentNode = root;

        for (const dir of dirs) {
            const existing = currentNode.children.get(dir);
            if (existing) {
                currentNode = existing;
                continue;
            }

            const newChild: SelectionNode = {
                terminal: false,
                children: new Map<string, SelectionNode>()
            };
            currentNode.children.set(dir, newChild);
            currentNode = newChild;
        }

        currentNode.terminal = true;
        currentNode.children.clear();
    });

    const excludes = new Set<string>();

    const collectExcludes = async (node: SelectionNode, currentPath: string[]) => {
        if (node.terminal) {
            return;
        }

        const siblings = await readSiblings(currentPath);

        siblings.forEach(sibling => {
            if (node.children.has(sibling)) {
                return;
            }

            const siblingPath = [...currentPath, sibling].map(escapeGlobSegment).join('/');
            excludes.add(siblingPath);
            excludes.add(`${siblingPath}/**`);
        });

        for (const [childName, childNode] of node.children.entries()) {
            await collectExcludes(childNode, [...currentPath, childName]);
        }
    };

    await collectExcludes(root, []);
    return [...excludes];
}

async function createExcludeList(paths: string[], workspaceUri: vscode.Uri) {
    return createExcludeListForSelections(paths, async currentPath => {
        let currentUri = workspaceUri;

        currentPath.forEach(segment => {
            currentUri = vscode.Uri.joinPath(currentUri, segment);
        });

        try {
            const entries = await vscode.workspace.fs.readDirectory(currentUri);
            return entries.map(([name]) => name);
        }
        catch {
            return [];
        }
    });
}

function createLegacyExcludeList(path: string) {
    const excludes = new Set<string>();

    const dirs = path.split('/').filter(Boolean);
    dirs.forEach((dir, dirI) => {
        const dirsSoFar = dirs.slice(0, dirI).map(escapeGlobSegment).join('/') + (dirI > 0 ? '/' : '');

        for (let i = 1; i < dir.length; i++) {
            const strictPrefix = escapeGlobSegment(dir.slice(0, i));
            excludes.add(`${dirsSoFar}${strictPrefix}`);
            excludes.add(`${dirsSoFar}${strictPrefix}/**`);
        }

        for (let i = 0; i < dir.length; i++) {
            const prefix = escapeGlobSegment(dir.slice(0, i));
            const char = escapeNegatedCharClassChar(dir[i]);
            excludes.add(`${dirsSoFar}${prefix}[!${char}]*/**`);
        }

        excludes.add(`${dirsSoFar}${escapeGlobSegment(dir)}[!/]*/**`);
    });

    return [...excludes];
}

function getExcludes(workspace: vscode.WorkspaceFolder) {
    try {
        const config = vscode.workspace.getConfiguration('files', workspace.uri);
        return { ...(config.get<ExcludeObject>('exclude', {}) || {}) };
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}

async function updateExcludes(workspace: vscode.WorkspaceFolder, excludes: ExcludeObject) {
    try {
        const config = vscode.workspace.getConfiguration('files', workspace.uri);
        const target = vscode.ConfigurationTarget.WorkspaceFolder;
        return await config.update('exclude', excludes, target);
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}

async function applyManagedExcludes(
    workspace: vscode.WorkspaceFolder,
    previousManaged: string[],
    nextManaged: string[]
) {
    const excludes = getExcludes(workspace);
    if (!excludes) {
        return [];
    }

    const previousSet = new Set(previousManaged.filter(Boolean));
    const nextUnique = [...new Set(nextManaged.filter(Boolean))];
    const nextSet = new Set(nextUnique);

    previousSet.forEach(path => {
        if (!nextSet.has(path) && Object.prototype.hasOwnProperty.call(excludes, path)) {
            delete excludes[path];
        }
    });

    nextUnique.forEach(path => {
        excludes[path] = true;
    });

    await updateExcludes(workspace, excludes);
    return nextUnique;
}

function getStateMap(key: string) {
    if (!vscodeContext) {
        return {};
    }

    const stateMap = vscodeContext.workspaceState.get<StringListMap | undefined>(key, undefined);
    if (!stateMap) {
        return {};
    }

    return Object.entries(stateMap).reduce((result, [workspaceKey, paths]) => {
        if (Array.isArray(paths) && paths.length > 0) {
            result[workspaceKey] = [...new Set(paths.filter(Boolean))];
        }

        return result;
    }, {} as StringListMap);
}

async function saveStateMap(key: string, values: StringListMap) {
    if (!vscodeContext) {
        return;
    }

    const sanitized = Object.entries(values).reduce((result, [workspaceKey, paths]) => {
        if (Array.isArray(paths) && paths.length > 0) {
            result[workspaceKey] = [...new Set(paths.filter(Boolean))];
        }

        return result;
    }, {} as StringListMap);

    await vscodeContext.workspaceState.update(
        key,
        Object.keys(sanitized).length > 0 ? sanitized : undefined
    );
}

function hasActiveScopes(selectedByWorkspace: StringListMap) {
    return Object.values(selectedByWorkspace).some(paths => paths.length > 0);
}

async function setScopedContext(scoped: boolean) {
    await vscode.commands.executeCommand('setContext', CONTEXT_IS_SCOPED, scoped);
}

async function migrateLegacyState() {
    if (!vscodeContext) {
        return;
    }

    const legacyScope = vscodeContext.workspaceState.get<string | undefined>(KEY_CURRENT_SCOPE, undefined);
    const legacyExcludes = vscodeContext.workspaceState.get<string[]>(KEY_CURRENT_EXCLUDES, [] as string[]);

    if (!legacyScope && legacyExcludes.length === 0) {
        return;
    }

    const legacyPaths = legacyExcludes.length > 0
        ? legacyExcludes
        : (legacyScope ? createLegacyExcludeList(legacyScope) : []);

    await clearLegacyExcludes(legacyPaths);
    await clearLegacyState();
}

async function clearLegacyState() {
    if (!vscodeContext) {
        return;
    }

    await vscodeContext.workspaceState.update(KEY_CURRENT_SCOPE, undefined);
    await vscodeContext.workspaceState.update(KEY_CURRENT_EXCLUDES, undefined);
}

async function clearLegacyExcludes(legacyPaths: string[]) {
    if (legacyPaths.length === 0) {
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('files', null);
        const excludes = { ...(config.get<ExcludeObject>('exclude', {}) || {}) };
        let changed = false;

        legacyPaths.forEach(path => {
            if (Object.prototype.hasOwnProperty.call(excludes, path)) {
                delete excludes[path];
                changed = true;
            }
        });

        if (!changed) {
            return;
        }

        await config.update('exclude', excludes, vscode.ConfigurationTarget.Workspace);
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}
