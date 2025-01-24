import * as vscode from 'vscode';
import { RoutesProvider } from './providers/routesProvider';
import { RouteItem } from './models/routeItem';
import path from 'path';
import fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
	// Initialize the routes provider
	const routesProvider = new RoutesProvider();

	// Create the tree view
	const treeView = vscode.window.createTreeView('routesView', {
		treeDataProvider: routesProvider,
		showCollapseAll: true
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
                        projectRoot: "frontend/"
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