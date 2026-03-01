# Scope to This 🎯

Adds "Scope to This" option to the Explorer context menu, like in Visual Studio. Lets you focus on the things that matter.

<img src="https://raw.githubusercontent.com/rhalaly/scope-to-this-vscode/master/resources/demo.gif" width="400">

## Features ✨
* Adds "Scope to This" option to the Explorer context menu to scope the selected directories.
* Supports additive scoping: scope one folder, then keep adding more folders (including multi-select in Explorer) without clearing the previous scope.
* Adds "Clear scope" option to the Folders view as a shortcut icon (also available as a command `scope-to-this.clear`) to clear all active scopes and return to the project's root folder.  
![clear-shortcut](https://raw.githubusercontent.com/rhalaly/scope-to-this-vscode/master/resources/clear-shortcut.png)

## Known Issues 🐛

* To scope we use the `file.exclude` option in the `settings.json` configuration file. This file may be included in the Git repository. So be careful when you commit...

## Acknowledgement 🙏
This project inspired by these projects:
* [Explorer Exclude](https://github.com/redvanworkshop/explorer-exclude-vscode-extension)
