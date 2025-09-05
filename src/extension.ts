// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { NotebookCell, NotebookDocument } from 'vscode';

// Keys for persisting last-used tag
const GLOBAL_LAST_TAG_KEY = 'runcellswithtag:lastTag:global';
const PER_NOTEBOOK_LAST_TAG_PREFIX = 'runcellswithtag:lastTag:notebook:';

function getCellTags(cell: vscode.NotebookCell): string[] {
    // Try several common locations where Jupyter tags might live
    const md = cell.metadata as any;
    const out: string[] = [];


    const push = (v: unknown) => {
        if (!v) { return; }
        if (Array.isArray(v)) {
            for (const t of v) {
                if (typeof t === 'string') {
                    out.push(t);
                }
            }
        } else if (typeof v === 'string') {
            // Allow comma/space separated strings just in case
            out.push(...v.split(/[\s,]+/).filter(Boolean));
        }
    };

    // Known / observed paths (in order of likelihood)
    push(md?.metadata?.tags); // <— user-reported working path (metadata.metadata.tags)
    push(md?.tags); // classic nbformat location
    push(md?.jupyter?.tags);
    push(md?.jupyter?.metadata?.tags);
    push(md?.custom?.metadata?.tags); // VS Code often nests raw ipynb under custom
    push(md?.custom?.tags);
    push(md?.custom?.jupyter?.tags);
    push(md?.custom?.jupyter?.metadata?.tags);
    push(md?.raw?.metadata?.tags); // some exporters
    push(md?.ipynb?.metadata?.tags); // defensive
    push(md?.vscode?.metadata?.tags); // defensive


    // Deduplicate while preserving order
    const seen = new Set<string>();
    return out.filter(t => {
        if (seen.has(t)) {
            return false;
        }
        seen.add(t);
        return true;
    });
}

function collectAllTags(doc: vscode.NotebookDocument): string[] {
    const set = new Set<string>();
    for (const cell of doc.getCells()) {
        for (const t of getCellTags(cell)) {
            if (t && typeof t === 'string') {
                set.add(t);
            }
        }
    }
    return [...set];
}

function storageKeyForNotebook(doc: vscode.NotebookDocument) {
    // Use the URI path as part of the key so different notebooks can have different "last" tags
    const id = doc.uri.toString();
    return `${PER_NOTEBOOK_LAST_TAG_PREFIX}${id}`;
}

async function getLastUsedTag(ctx: vscode.ExtensionContext, doc?: vscode.NotebookDocument): Promise<string | undefined> {
    const perNotebook = doc ? ctx.globalState.get<string>(storageKeyForNotebook(doc)) : undefined;
    return perNotebook ?? ctx.globalState.get<string>(GLOBAL_LAST_TAG_KEY) ?? undefined;
}

async function setLastUsedTag(ctx: vscode.ExtensionContext, tag: string, doc?: vscode.NotebookDocument) {
    if (doc) await ctx.globalState.update(storageKeyForNotebook(doc), tag);
    await ctx.globalState.update(GLOBAL_LAST_TAG_KEY, tag);
}

async function pickTag(
    ctx: vscode.ExtensionContext,
    doc: vscode.NotebookDocument,
    allTags: string[],
): Promise<string | undefined> {
    const last = await getLastUsedTag(ctx, doc);

    if (allTags.length === 0) {
        // No tags present show message and return
        vscode.window.showInformationMessage('No tags found in the current notebook.');
        return undefined;
    }

    if (allTags.length === 1) {
        // Only one tag present -> do not prompt
        return allTags[0];
    }

    // Multiple tags -> offer quick pick with last used highlighted at top
    let items = allTags.slice().sort((a, b) => a.localeCompare(b));
    if (last && items.includes(last)) {
        items = [last, ...items.filter(t => t !== last)];
    }

    const qpItems = items.map(label => ({ label, description: label === last ? 'last used' : undefined }));

    // Additionally allow manual entry
    qpItems.push({ label: '$(pencil) Type a different tag…', description: 'manual entry' } as any);

    const picked = await vscode.window.showQuickPick(qpItems as vscode.QuickPickItem[], {
        title: 'Run cells with tag',
        placeHolder: last ? `Choose a tag (last used: ${last})` : 'Choose a tag',
        canPickMany: false,
        ignoreFocusOut: true,
        matchOnDescription: true,
    });

    if (!picked) return undefined;

    if (picked.description === 'manual entry') {
        const typed = await vscode.window.showInputBox({
            title: 'Run cells with tag',
            prompt: 'Enter a tag to run',
            placeHolder: 'e.g. train, preprocess, viz',
            value: last ?? '',
            ignoreFocusOut: true,
        });
        return typed?.trim() || undefined;
    }

    return picked.label;
}

async function executeCellsWithTag(doc: vscode.NotebookDocument, tag: string) {
    const target: vscode.NotebookCell[] = [];
    for (const cell of doc.getCells()) {
        const tags = getCellTags(cell);
        if (tags.includes(tag)) target.push(cell);
    }

    if (target.length === 0) {
        vscode.window.showWarningMessage(`No cells found with tag "${tag}" in this notebook.`);
        return;
    }

    // Execute cells in order
    for (const cell of target) {
        await vscode.commands.executeCommand('notebook.cell.execute', { start: cell.index, end: cell.index + 1 });
    }

    vscode.window.showInformationMessage(`Executed ${target.length} cell${target.length === 1 ? '' : 's'} with tag "${tag}".`);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('runcellswithtag: activated');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('runcellswithtag.runCellsWithTag', async () => {
        const editor = vscode.window.activeNotebookEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open a notebook to run cells by tag.');
            return;
        }

        const doc = editor.notebook;
        const allTags = collectAllTags(doc);
        const tag = await pickTag(context, doc, allTags);
        if (!tag) return; // user cancelled or empty

        await setLastUsedTag(context, tag, doc);
        await executeCellsWithTag(doc, tag);
    });

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
