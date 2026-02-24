import * as vscode from 'vscode';

type ExcludeObject = { [key: string]: any };

const KEY_CURRENT_SCOPE = 'scopeToThis.currentScope';
const CONTEXT_IS_SCOPED = 'scopeToThis.scoped';

const workspaceFolders = vscode.workspace.workspaceFolders;

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
        const relative = getRelativePath(path);

        const excludes = getExcludes();

        if (excludes && relative) {
            const paths = createExcludeList(relative);

            paths.forEach(path => excludes[path] = true);

            await updateExcludes(excludes);

            vscodeContext?.workspaceState.update(KEY_CURRENT_SCOPE, relative);
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
        if (scope) {
            const excludes = getExcludes();
            if (excludes) {
                const paths = createExcludeList(scope);

                paths.forEach(path => {
                    if (path && excludes.hasOwnProperty(path)) {
                        excludes[path] = undefined;
                    }
                });

                await updateExcludes(excludes);

                vscodeContext?.workspaceState.update(KEY_CURRENT_SCOPE, undefined);
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

function getRelativePath(path: vscode.Uri) {
    if (!workspaceFolders || !workspaceFolders.length) {
        return;
    }

    for (const workspace of workspaceFolders) {
        if (path.fsPath.startsWith(workspace.uri.fsPath)) {
            const relative = path.path.substring(workspace.uri.path.length);
            return relative.startsWith('/') ? relative.substring(1) : relative;
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

export function createExcludeList(path: string) {
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
