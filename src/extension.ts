import * as vscode from 'vscode';
import { RoutesProvider } from './providers/routesProvider';
import { RouteItem } from './models/routeItem';
import { PageContentProvider } from './providers/pageContentProvider';
import { ContentItemType, PageContentItem } from './models/pageContentItem';
import path from 'path';
import fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
	// Initialize the routes provider
	const routesProvider = new RoutesProvider();
	
	// Initialize the page content provider
	const pageContentProvider = new PageContentProvider();

	// Create the tree views
	const routesTreeView = vscode.window.createTreeView('routesView', {
		treeDataProvider: routesProvider,
		showCollapseAll: true
	});
	
	// Create the page content tree view
	const pageContentTreeView = vscode.window.createTreeView('pageContentView', {
		treeDataProvider: pageContentProvider,
		showCollapseAll: false
	});

	const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const routesDir = routesProvider.getRoutesDir();
        
        if (!fs.existsSync(routesDir)) {
            vscode.window.showWarningMessage(
                'SvelteKit routes directory not found. Create .vscode/svelte-radar.json to configure root of your sveltekit project.',
                'Create Config'
            ).then(selection => {
                if (selection === 'Create Config') {
                    const configDir = path.join(workspaceRoot, '.vscode');
                    const configPath = path.join(configDir, 'svelte-radar.json');
                    
                    fs.mkdirSync(configDir, { recursive: true });
                    fs.writeFileSync(configPath, JSON.stringify({
                        projectRoot: "frontend/",
						port: 5173
                    }, null, 2));
                    
                    vscode.workspace.openTextDocument(configPath)
                        .then(doc => vscode.window.showTextDocument(doc));
                }
            });
        }
    }

	// Register commands
	const commands = [
		{
			command: 'svelteRadar.openRoute',
			callback: async () => {
				const input = await vscode.window.showInputBox({
					prompt: "Enter a URL or route path",
					placeHolder: "https://example.com/dashboard/profile or /dashboard/profile",
					validateInput: (value) => {
						if (!value.trim()) {
							return "Please enter a URL or route path";
						}
						return null;
					}
				});
				if (input) {
					routesProvider.openRoute(input);
				}
			}
		},
		{
			command: 'svelteRadar.refreshRoutes',
			callback: () => routesProvider.refresh()
		},
		{
			command: 'svelteRadar.toggleViewType',
			callback: () => routesProvider.toggleViewType()
		},
		{
			command: 'svelteRadar.search',
			callback: () => routesProvider.search()
		},
		{
			command: 'svelteRadar.clearSearch',
			callback: () => routesProvider.clearSearch()
		},
		{
			command: 'svelteRadar.openInBrowser',
			callback: (route: RouteItem) => {
				if (route.routeType !== 'divider' && route.routePath !== 'spacer') {
					const port = routesProvider.getPort();
					const cleanPath = route.routePath
						.replace(/\\/g, '/')
						.replace(/^\([^)]+\)\//, '')  // Remove root level group
						.replace(/\/\([^)]+\)\//g, '/'); // Remove nested groups
					
					// Handle root path specially
					const url = cleanPath === '/' 
						? `http://localhost:${port}/`
						: `http://localhost:${port}/${cleanPath}`;
						
					vscode.env.openExternal(vscode.Uri.parse(url));
				}
			}
		},
		{
			command: 'svelteRadar.openFile',
			callback: (route: RouteItem) => {
				if (route.routeType !== 'divider' && route.filePath) {
					vscode.window.showTextDocument(vscode.Uri.file(route.filePath));
				}
			}
		},
		{
			command: 'svelteRadar.toggleSorting',
			callback: async () => {
				const config = vscode.workspace.getConfiguration('svelteRadar');
				const currentType = config.get('sortingType', 'natural');
				const newType = currentType === 'natural' ? 'basic' : 'natural';
				await config.update('sortingType', newType, true);
				routesProvider.refresh();
			}
		},
		// Page content commands
		{
			command: 'svelteRadar.refreshPageContent',
			callback: () => pageContentProvider.refresh()
		},
		{
			command: 'svelteRadar.scrollToLine',
			callback: (filePath: string, line: number) => {
				// Open the file if not already open
				vscode.workspace.openTextDocument(filePath)
					.then(document => {
						return vscode.window.showTextDocument(document);
					})
					.then(editor => {
						// Create a range for the entire line
						const range = new vscode.Range(
							new vscode.Position(line, 0),
							new vscode.Position(line, editor.document.lineAt(line).text.length)
						);
						
						// Set the editor's selection to that range and reveal it
						editor.selection = new vscode.Selection(range.start, range.end);
						editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
					})
					.then(undefined, (error: Error) => {
						console.error('Error scrolling to line:', error);
						vscode.window.showErrorMessage(`Could not scroll to line: ${error.message}`);
					});
			}
		},
		{
			command: 'svelteRadar.openComponentFile',
			callback: (item: PageContentItem) => {
				if ((item.type === ContentItemType.Component || item.type === ContentItemType.ComponentInstance) && item.componentFilePath) {
					vscode.workspace.openTextDocument(item.componentFilePath)
						.then(document => vscode.window.showTextDocument(document))
						.then(undefined, (error: Error) => {
							console.error('Error opening component file:', error);
							vscode.window.showErrorMessage(`Could not open component file: ${error.message}`);
						});
				}
			}
		}
	];

	// Register all commands
	commands.forEach(({ command, callback }) => {
		context.subscriptions.push(
			vscode.commands.registerCommand(command, callback)
		);
	});
}

export function deactivate() { }