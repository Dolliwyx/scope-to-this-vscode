import * as vscode from 'vscode';

type ExcludeObject = { [key: string]: any };

const KEY_CURRENT_SCOPE = 'scopeToThis.currentScope';
const KEY_CURRENT_EXCLUDES = 'scopeToThis.currentExcludes';
const CONTEXT_IS_SCOPED = 'scopeToThis.scoped';

let vscodeContext: vscode.ExtensionContext | null = null;

export function initContext(context: vscode.ExtensionContext) {
    vscodeContext = context;

    const scope = vscodeContext?.workspaceState.get(KEY_CURRENT_SCOPE, undefined);
    if (scope) {
        vscode.commands.executeCommand('setContext', CONTEXT_IS_SCOPED, true);
    }
}

export async function scopeToThis(path: vscode.Uri) {
    try {
        const workspaceAndPath = getWorkspaceAndRelativePath(path);

        const excludes = getExcludes();

        if (excludes && workspaceAndPath) {
            const paths = await createExcludeList(workspaceAndPath.relativePath, workspaceAndPath.workspace.uri);

            paths.forEach(path => excludes[path] = true);

            await updateExcludes(excludes);

            await vscodeContext?.workspaceState.update(KEY_CURRENT_SCOPE, workspaceAndPath.relativePath);
            await vscodeContext?.workspaceState.update(KEY_CURRENT_EXCLUDES, paths);
            vscode.commands.executeCommand('setContext', CONTEXT_IS_SCOPED, true);
        } else {
            vscode.window.showErrorMessage("Error in reading vscode settings.");
        }
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}

export async function clearScope() {
    try {
        const scope = vscodeContext?.workspaceState.get(KEY_CURRENT_SCOPE, undefined);
        const currentExcludes = vscodeContext?.workspaceState.get(KEY_CURRENT_EXCLUDES, [] as string[]);

        if (scope || (currentExcludes && currentExcludes.length > 0)) {
            const excludes = getExcludes();
            if (excludes) {
                const paths = (currentExcludes && currentExcludes.length > 0)
                    ? currentExcludes
                    : (scope ? createLegacyExcludeList(scope) : []);

                paths.forEach(path => {
                    if (path && excludes.hasOwnProperty(path)) {
                        excludes[path] = undefined;
                    }
                });

                await updateExcludes(excludes);

                await vscodeContext?.workspaceState.update(KEY_CURRENT_SCOPE, undefined);
                await vscodeContext?.workspaceState.update(KEY_CURRENT_EXCLUDES, undefined);
                vscode.commands.executeCommand('setContext', CONTEXT_IS_SCOPED, false);
            } else {
                vscode.window.showErrorMessage("Error in reading vscode settings.");
            }
        }
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}

function getWorkspaceAndRelativePath(path: vscode.Uri) {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || !workspaceFolders.length) {
        return;
    }

    for (const workspace of workspaceFolders) {
        if (path.fsPath.startsWith(workspace.uri.fsPath)) {
            const relative = path.path.substring(workspace.uri.path.length);
            return {
                workspace,
                relativePath: relative.startsWith('/') ? relative.substring(1) : relative
            };
        }
    }
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

async function createExcludeList(path: string, workspaceUri: vscode.Uri) {
    const dirs = path.split('/').filter(Boolean);
    const siblingsByLevel: string[][] = [];

    let currentUri = workspaceUri;

    for (const dir of dirs) {
        const entries = await vscode.workspace.fs.readDirectory(currentUri);
        siblingsByLevel.push(entries.map(([name]) => name));
        currentUri = vscode.Uri.joinPath(currentUri, dir);
    }

    return createExcludeListForSiblings(path, siblingsByLevel);
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

function getExcludes() {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || !workspaceFolders.length) {
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('files', null);
        return config.get<ExcludeObject>('exclude', {});
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}

async function updateExcludes(excludes: ExcludeObject) {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
        try {
            const config = vscode.workspace.getConfiguration('files', null);
            const target = vscode.ConfigurationTarget.Workspace || null;
            return await config.update('exclude', excludes, target);
        }
        catch (error) {
            vscode.window.showErrorMessage(error.message || error);
        }
    }
}
