// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as utils from './utils';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

    await utils.initContext(context);

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let scope = vscode.commands.registerCommand('scope-to-this.scope', async (path: vscode.Uri, paths?: vscode.Uri[]) => {
        // The code you place here will be executed every time your command is executed

        const selectedPaths = (paths && paths.length > 0)
            ? paths
            : (path ? [path] : []);

        if (selectedPaths.length === 0) {
            vscode.window.showInformationMessage("Use this command from the Explorer context menu.");
            return;
        }

        await utils.scopeToThese(selectedPaths);
    });

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let clear = vscode.commands.registerCommand('scope-to-this.clear', async () => {
        // The code you place here will be executed every time your command is executed

        await utils.clearScope();
    });

    context.subscriptions.push(scope);
    context.subscriptions.push(clear);
}

// this method is called when your extension is deactivated
export function deactivate() { }
