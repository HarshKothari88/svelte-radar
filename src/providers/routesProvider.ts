import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RouteItem } from '../models/routeItem';
import { RouteUtils } from '../utils/routeUtils';
import { ResetInfo, RouteType } from '../constant/type';

/**
 * Provider class for managing SvelteKit routes in VS Code
 */
export class RoutesProvider implements vscode.TreeDataProvider<RouteItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RouteItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private port: number;
    private flatView: boolean;
    private searchPattern: string = '';

    constructor() {
        this.flatView = vscode.workspace.getConfiguration('svelteRadar').get('viewType', 'flat') === 'flat';
        const workspaceFolders = vscode.workspace.workspaceFolders;
        this.port = workspaceFolders
            ? RouteUtils.detectPort(workspaceFolders[0].uri.fsPath)
            : 5173;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: RouteItem): vscode.TreeItem {
        return element;
    }

    getPort(): number {
        return this.port;
    }

    toggleViewType(): void {
        this.flatView = !this.flatView;
        vscode.workspace.getConfiguration('svelteRadar').update('viewType', this.flatView ? 'flat' : 'hierarchical', true);
        this.refresh();
    }

    async getChildren(element?: RouteItem): Promise<RouteItem[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return []; }

        const routesDir = path.join(workspaceFolders[0].uri.fsPath, "src", "routes");
        if (!fs.existsSync(routesDir)) {
            vscode.window.showErrorMessage("SvelteKit routes directory not found.");
            return [];
        }

        if (this.flatView && !element) {
            const routes = this.buildRoutesTree(routesDir, "");
            const flatRoutes = this.flattenRoutes(routes);
            return this.filterRoutes(flatRoutes);
        }

        if (!element) {
            const routes = this.buildRoutesTree(routesDir, "");
            return this.filterRoutes(routes);
        }

        return this.filterRoutes(element.children || []);
    }

    private buildRoutesTree(dir: string, basePath: string): RouteItem[] {
        const entries = fs.readdirSync(dir).filter(file => !file.startsWith("."));
        const routes: RouteItem[] = [];
    
        entries.sort((a, b) => this.compareRoutes(a, b));
    
        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = fs.statSync(fullPath);
    
            if (stat.isDirectory()) {
                const routePath = path.join(basePath, entry);
                const routeType = this.determineRouteType(entry);
                const pageInfo = this.findPageInfo(fullPath);
                const children = this.buildRoutesTree(fullPath, routePath);
    
                // Only add the route if it has a page file or is a group
                if (pageInfo.filePath || routeType === 'group') {
                    routes.push(new RouteItem(
                        routePath,
                        routePath,
                        pageInfo.filePath,
                        children,
                        this.port,
                        routeType,
                        !this.flatView,
                        pageInfo.resetInfo
                    ));
                } else {
                    // If no page file, just add children without creating intermediate route
                    routes.push(...children);
                }
            }
        }
    
        return routes;
    }
    
    private determineRouteType(entry: string): RouteType {
        if (entry.startsWith('(') && entry.endsWith(')')) {
            return 'group';
        }
        if (entry.startsWith('[...') && entry.endsWith(']')) {
            return 'rest';
        }
        if (entry.startsWith('[[') && entry.endsWith(']]')) {
            return 'optional';
        }
        if (entry.startsWith('[') && entry.endsWith(']')) {
            return 'dynamic';
        }
        return 'static';
    }

    private findPageInfo(dir: string): { filePath: string; resetInfo: ResetInfo | null } {
        const files = fs.readdirSync(dir);

        // Check for reset pages first
        for (const file of files) {
            if (file.includes('+page@')) {
                const resetInfo = this.parseResetInfo(file);
                if (resetInfo) {
                    return {
                        filePath: path.join(dir, file),
                        resetInfo
                    };
                }
            }
        }

        // Check for regular page
        const regularPage = files.find(f => f === '+page.svelte');
        if (regularPage) {
            return {
                filePath: path.join(dir, regularPage),
                resetInfo: null
            };
        }

        return {
            filePath: '',
            resetInfo: null
        };
    }

    private parseResetInfo(fileName: string): ResetInfo | null {
        const match = fileName.match(/\+page@(.*)\.svelte$/);
        if (!match) { return null; }

        const resetTarget = match[1] || 'root';
        return {
            resetTarget,
            displayName: resetTarget || 'root',
            layoutLevel: 0  // This will be calculated based on path depth
        };
    }

    private flattenRoutes(routes: RouteItem[]): RouteItem[] {
        const routeGroups = new Map<string, RouteItem[]>();

        const processRoute = (item: RouteItem) => {
            const segments = item.routePath.split('\\');
            const topLevel = segments[0] || 'root';

            if (!routeGroups.has(topLevel)) {
                routeGroups.set(topLevel, []);
            }

            // Add the route with its full path
            let displayName = item.routePath;
            if (item.resetInfo) {
                displayName += ` (resets to ${item.resetInfo.displayName})`;
            }

            routeGroups.get(topLevel)?.push(new RouteItem(
                displayName,
                item.routePath,
                item.filePath,
                [],
                this.port,
                item.routeType,
                false,
                item.resetInfo
            ));

            // Process children
            if (item.children.length > 0) {
                item.children.forEach(child => processRoute(child));
            }
        };

        routes.forEach(route => processRoute(route));

        // Create final flat list with dividers
        const flatList: RouteItem[] = [];
        const sortedGroups = Array.from(routeGroups.keys()).sort();

        sortedGroups.forEach(section => {
            // Add section divider
            flatList.push(new RouteItem(
                `━━━━━ ${section} ━━━━━`,
                '',
                '',
                [],
                this.port,
                'divider'
            ));

            // Add routes for this section
            flatList.push(...(routeGroups.get(section) || []));
        });

        return flatList;
    }

    private compareRoutes(a: string, b: string): number {
        // Static segments win over dynamic segments
        const aIsDynamic = a.includes('[');
        const bIsDynamic = b.includes('[');
        if (!aIsDynamic && bIsDynamic) { return -1; }
        if (aIsDynamic && !bIsDynamic) { return 1; }

        // Rest/optional parameters have lowest priority
        const aIsSpecial = a.startsWith('[...') || a.startsWith('[[');
        const bIsSpecial = b.startsWith('[...') || b.startsWith('[[');
        if (!aIsSpecial && bIsSpecial) { return -1; }
        if (aIsSpecial && !bIsSpecial) { return 1; }

        return 0;
    }

    async search() {
        const searchInput = await vscode.window.showInputBox({
            prompt: "Search routes",
            placeHolder: "Enter route path or name"
        });

        if (searchInput !== undefined) {
            this.searchPattern = searchInput.toLowerCase();
            this.refresh();
        }
    }

    clearSearch() {
        this.searchPattern = '';
        this.refresh();
    }

    private filterRoutes(routes: RouteItem[]): RouteItem[] {
        if (!this.searchPattern) {
            return routes;
        }

        return routes.filter(route => {
            // Don't filter dividers
            if (route.routeType === 'divider') {
                return true;
            }

            const matchesSearch = route.label.toLowerCase().includes(this.searchPattern) ||
                route.routePath.toLowerCase().includes(this.searchPattern);

            if (route.children.length > 0) {
                route.children = this.filterRoutes(route.children);
                return route.children.length > 0 || matchesSearch;
            }

            return matchesSearch;
        });
    }

    private formatRoutePath(path: string, type: RouteType): string {
        const segments = path.split('\\');
        return segments.map(segment => {
            // Handle rest parameters [...param]
            if (segment.startsWith('[...') && segment.endsWith(']')) {
                return `*${segment.slice(4, -1)}`;
            }
            // Handle optional parameters [[param]]
            if (segment.startsWith('[[') && segment.endsWith(']]')) {
                return `?${segment.slice(2, -2)}`;
            }
            // Handle dynamic parameters [param]
            if (segment.startsWith('[') && segment.endsWith(']')) {
                return segment.slice(1, -1);
            }
            // Handle groups (group)
            if (segment.startsWith('(') && segment.endsWith(')')) {
                return segment;
            }
            return segment;
        }).join('\\');
    }

    private getRouteDescription(type: RouteType): string {
        switch (type) {
            case 'dynamic':
                return '[dynamic]';
            case 'rest':
                return '[rest]';
            case 'optional':
                return '[optional]';
            case 'error':
                return '[error]';
            case 'layout':
                return '[layout]';
            case 'group':
                return '[group]';
            default:
                return '[page]';
        }
    }

    /**
     * Opens a route in the editor
     */
    async openRoute(input: string | RouteItem) {
        if (typeof input === 'string') {
            // Handle string input (URL or path)
            const relativePath = input.replace(/^(http:\/\/localhost(:\d+)?|\/)/, '');
            const routeFile = await this.findMatchingRoute(relativePath);

            if (routeFile) {
                const document = await vscode.workspace.openTextDocument(routeFile);
                await vscode.window.showTextDocument(document);
            } else {
                vscode.window.showErrorMessage(`No matching route found for: ${input}`);
            }
        } else {
            // Handle RouteItem input
            if (input.filePath) {
                const document = await vscode.workspace.openTextDocument(input.filePath);
                await vscode.window.showTextDocument(document);
            }
        }
    }

    /**
 * Finds matching route file for given path
 */
    private async findMatchingRoute(relativePath: string): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {return null;}

        const routesDir = path.join(workspaceFolders[0].uri.fsPath, "src", "routes");
        const segments = relativePath.split('/').filter(Boolean);
        let currentDir = routesDir;

        for (const segment of segments) {
            const entries = fs.readdirSync(currentDir);

            // Try exact match first
            const exactMatch = entries.find(entry => entry === segment || entry === `[${segment}]`);
            if (exactMatch) {
                currentDir = path.join(currentDir, exactMatch);
                continue;
            }

            // Try dynamic route match
            const dynamicMatch = entries.find(entry =>
                (entry.startsWith('[') && entry.endsWith(']')) ||
                (entry.startsWith('[...') && entry.endsWith(']'))
            );

            if (dynamicMatch) {
                currentDir = path.join(currentDir, dynamicMatch);
                continue;
            }

            return null;
        }

        const pagePath = path.join(currentDir, '+page.svelte');
        return fs.existsSync(pagePath) ? pagePath : null;
    }

    /**
     * Opens a route in the browser
     */
    openInBrowser(route: RouteItem) {
        if (route.routePath) {
            const url = `http://localhost:${this.port}${route.routePath.replace(/\\/g, '/')}`;
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }
}