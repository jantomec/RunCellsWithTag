// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { NotebookCell, NotebookDocument } from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "runcellswithtag" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('runcellswithtag.runCellsWithTag', async (tag?: string) => {
        const editor = vscode.window.activeNotebookEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active notebook found.');
            return;
        }

        // Prompt user for tag if not provided as a parameter
        if (!tag) {
            tag = await vscode.window.showInputBox({
                prompt: 'Enter tag name to run the cells',
                placeHolder: 'yourTag'
            });

            if (!tag) {
                vscode.window.showErrorMessage('Tag name was not provided.');
                return;
            }
        }
		
        const cellsToRun = editor.notebook.getCells().filter((cell: NotebookCell) => 
            cell.metadata.metadata?.tags?.includes(tag)
        );

		console.log("Cells to run", cellsToRun);

        for (const cell of cellsToRun) {
            await vscode.commands.executeCommand('notebook.cell.execute', { start: cell.index, end: cell.index + 1 });
        }

        vscode.window.showInformationMessage(`Executed ${cellsToRun.length} cells with tag '${tag}'.`);
    });

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
