import * as vscode from 'vscode';
import { RoutesProvider } from './providers/routesProvider';
import { RouteItem } from './models/routeItem';

export function activate(context: vscode.ExtensionContext) {
	// Initialize the routes provider
	const routesProvider = new RoutesProvider();

	// Create the tree view
	const treeView = vscode.window.createTreeView('routesView', {
		treeDataProvider: routesProvider,
		showCollapseAll: true
	});

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
				if (route.routeType !== 'divider') {
					const port = routesProvider.getPort();
					// Use browserPath instead of routePath
					const cleanPath = route.routePath
						.replace(/\\/g, '/')
						.replace(/^\([^)]+\)\//, '')  // Remove root level group
						.replace(/\/\([^)]+\)\//g, '/'); // Remove nested groups
					const url = `http://localhost:${port}/${cleanPath}`;
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